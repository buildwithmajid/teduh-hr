import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditContext, AuthUser } from '../common/auth-context';
import { AuditService } from '../audit/audit.service';
import { hasAllPermissions } from '../auth/authz.service';
import { hashPassword, passwordPolicyViolation } from '../auth/password';
import { PrismaService, Tx } from '../prisma/prisma.service';

const userSelect = {
  id: true,
  email: true,
  isActive: true,
  mfaEnabled: true,
  lastLoginAt: true,
  createdAt: true,
  employee: { select: { id: true, fullName: true, employeeCode: true, companyId: true } },
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listRoles(companyId: string) {
    const roles = await this.prisma.role.findMany({
      where: { OR: [{ companyId: null }, { companyId }] },
      include: { rolePermissions: { include: { permission: true } } },
      orderBy: { name: 'asc' },
    });
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      requiresMfa: r.requiresMfa,
      isSystem: r.companyId === null,
      permissions: r.rolePermissions.map((rp) => rp.permission.code).sort(),
    }));
  }

  async list(companyId: string) {
    const users = await this.prisma.user.findMany({
      where: { userRoles: { some: { companyId } } },
      select: { ...userSelect, userRoles: { where: { companyId }, select: { role: { select: { id: true, name: true } } } } },
      orderBy: { email: 'asc' },
    });
    return users.map(({ userRoles, employee, ...u }) => ({
      ...u,
      employee: employee?.companyId === companyId ? { id: employee.id, fullName: employee.fullName, employeeCode: employee.employeeCode } : null,
      roles: userRoles.map((ur) => ur.role),
    }));
  }

  async create(
    actor: AuthUser,
    ctx: AuditContext,
    input: { email: string; password: string; roleIds: string[]; employeeId?: string },
  ) {
    const email = input.email.trim().toLowerCase();
    const violation = passwordPolicyViolation(input.password, email);
    if (violation) throw new BadRequestException(violation);
    await this.assertAssignableRoles(actor, input.roleIds);

    if (input.employeeId) {
      const employee = await this.prisma.employee.findFirst({ where: { id: input.employeeId, companyId: actor.companyId } });
      if (!employee) throw new NotFoundException('Karyawan tidak ditemukan');
      if (employee.userId) throw new ConflictException('Karyawan ini sudah punya akun');
    }
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('Email sudah terdaftar');
    }

    const passwordHash = await hashPassword(input.password);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email, passwordHash }, select: { id: true, email: true, isActive: true } });
      await tx.userRole.createMany({
        data: input.roleIds.map((roleId) => ({ userId: user.id, roleId, companyId: actor.companyId })),
      });
      if (input.employeeId) {
        await tx.employee.update({ where: { id: input.employeeId }, data: { userId: user.id } });
      }
      await this.audit.record(tx, ctx, {
        tableName: 'users',
        recordId: user.id,
        action: 'create',
        newValue: { ...user, roleIds: input.roleIds, employeeId: input.employeeId ?? null },
      });
      return { ...user, roleIds: input.roleIds, employeeId: input.employeeId ?? null };
    });
  }

  async setRoles(actor: AuthUser, ctx: AuditContext, userId: string, roleIds: string[]) {
    if (userId === actor.userId) throw new ForbiddenException('Tidak bisa mengubah role akun sendiri');
    await this.findInCompany(userId, actor.companyId);
    await this.assertAssignableRoles(actor, roleIds);

    // Role yang akan dicabut juga harus "di bawah" pelaku, supaya HR tidak bisa mencabut Super Admin.
    const current = await this.prisma.userRole.findMany({ where: { userId, companyId: actor.companyId } });
    await this.assertAssignableRoles(actor, current.map((c) => c.roleId).filter((id) => !roleIds.includes(id)), 'mencabut');

    return this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId, companyId: actor.companyId } });
      await tx.userRole.createMany({ data: roleIds.map((roleId) => ({ userId, roleId, companyId: actor.companyId })) });
      if (roleIds.length === 0) await this.revokeSessions(tx, userId);
      await this.audit.record(tx, ctx, {
        tableName: 'user_roles',
        recordId: userId,
        action: 'update',
        oldValue: { roleIds: current.map((c) => c.roleId).sort() },
        newValue: { roleIds: [...roleIds].sort() },
      });
      return { userId, roleIds };
    });
  }

  async setActive(actor: AuthUser, ctx: AuditContext, userId: string, isActive: boolean) {
    if (userId === actor.userId) throw new ForbiddenException('Tidak bisa menonaktifkan akun sendiri');
    const user = await this.findInCompany(userId, actor.companyId);
    const roleIds = (await this.prisma.userRole.findMany({ where: { userId, companyId: actor.companyId } })).map((r) => r.roleId);
    await this.assertAssignableRoles(actor, roleIds, 'mengubah status');

    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { isActive } });
      if (!isActive) await this.revokeSessions(tx, userId);
      await this.audit.record(tx, ctx, {
        tableName: 'users',
        recordId: userId,
        action: 'update',
        oldValue: { isActive: user.isActive },
        newValue: { isActive },
      });
      return { id: userId, isActive };
    });
  }

  /** Reset MFA (misal HP hilang). User wajib enrol ulang saat login berikutnya. */
  async resetMfa(actor: AuthUser, ctx: AuditContext, userId: string) {
    if (userId === actor.userId) throw new ForbiddenException('Tidak bisa mereset MFA akun sendiri');
    await this.findInCompany(userId, actor.companyId);
    const roleIds = (await this.prisma.userRole.findMany({ where: { userId, companyId: actor.companyId } })).map((r) => r.roleId);
    await this.assertAssignableRoles(actor, roleIds, 'mereset MFA');

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { mfaEnabled: false, mfaSecretEncrypted: null, mfaPendingEncrypted: null },
      });
      await this.revokeSessions(tx, userId);
      await this.audit.record(tx, ctx, {
        tableName: 'users',
        recordId: userId,
        action: 'update',
        newValue: { mfaReset: true },
      });
    });
  }

  private async findInCompany(userId: string, companyId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, userRoles: { some: { companyId } } } });
    if (!user) throw new NotFoundException('User tidak ditemukan');
    return user;
  }

  /**
   * Pelaku hanya boleh memberi/mencabut role yang seluruh permission-nya juga ia miliki,
   * supaya tidak ada eskalasi hak akses (misal HR memberi dirinya/orang lain super_admin).
   */
  private async assertAssignableRoles(actor: AuthUser, roleIds: string[], verb = 'memberikan'): Promise<void> {
    if (roleIds.length === 0) return;
    const unique = [...new Set(roleIds)];
    if (unique.length !== roleIds.length) throw new BadRequestException('Role duplikat');
    const roles = await this.prisma.role.findMany({
      where: { id: { in: unique }, OR: [{ companyId: null }, { companyId: actor.companyId }] },
      include: { rolePermissions: { include: { permission: true } } },
    });
    if (roles.length !== unique.length) throw new BadRequestException('Role tidak ditemukan');
    for (const role of roles) {
      const perms = role.rolePermissions.map((rp) => rp.permission.code);
      if (!hasAllPermissions(actor.permissions, perms)) {
        throw new ForbiddenException(`Tidak boleh ${verb} role "${role.name}" yang hak aksesnya melebihi hak Anda`);
      }
    }
  }

  private async revokeSessions(tx: Tx, userId: string) {
    await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
}
