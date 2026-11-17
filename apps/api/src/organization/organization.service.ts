import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditContext, AuthUser } from '../common/auth-context';
import { isValidTimeZone } from '../common/dates';
import { wouldCreateCycle } from '../common/validation';
import { AuditService } from '../audit/audit.service';
import { PrismaService, Tx } from '../prisma/prisma.service';
import {
  CreateCompanyDto,
  CreateDepartmentDto,
  CreatePositionDto,
  CreateWorkLocationDto,
  UpdateCompanyDto,
  UpdateCompanySettingsDto,
  UpdateDepartmentDto,
  UpdatePositionDto,
  UpdateWorkLocationDto,
} from './organization.dto';

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ───────────── Company ─────────────

  getCompany(companyId: string) {
    return this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  }

  /** Membuat perusahaan baru; pembuat otomatis menjadi super_admin di perusahaan itu. */
  async createCompany(actor: AuthUser, ctx: AuditContext, dto: CreateCompanyDto) {
    const superAdmin = await this.prisma.role.findFirst({ where: { companyId: null, name: 'super_admin' } });
    if (!superAdmin) throw new Error('Role super_admin belum di-seed');
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({ data: { ...dto, settings: { create: {} } } });
      await tx.userRole.create({ data: { userId: actor.userId, roleId: superAdmin.id, companyId: company.id } });
      await this.audit.record(tx, { ...ctx, companyId: company.id }, {
        tableName: 'companies',
        recordId: company.id,
        action: 'create',
        newValue: company,
      });
      return company;
    });
  }

  async updateCompany(companyId: string, ctx: AuditContext, dto: UpdateCompanyDto) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
      const after = await tx.company.update({ where: { id: companyId }, data: dto });
      await this.audit.record(tx, ctx, { tableName: 'companies', recordId: companyId, action: 'update', oldValue: before, newValue: after });
      return after;
    });
  }

  getSettings(companyId: string) {
    return this.prisma.companySettings.findUniqueOrThrow({ where: { companyId } });
  }

  async updateSettings(companyId: string, ctx: AuditContext, dto: UpdateCompanySettingsDto) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.companySettings.findUniqueOrThrow({ where: { companyId } });
      const after = await tx.companySettings.update({ where: { companyId }, data: dto });
      await this.audit.record(tx, ctx, {
        tableName: 'company_settings',
        recordId: companyId,
        action: 'update',
        oldValue: before,
        newValue: after,
      });
      return after;
    });
  }

  // ───────────── Department ─────────────

  listDepartments(companyId: string) {
    return this.prisma.department.findMany({
      where: { companyId },
      include: {
        head: { select: { id: true, fullName: true, employeeCode: true } },
        _count: { select: { employees: true, positions: true, children: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createDepartment(companyId: string, ctx: AuditContext, dto: CreateDepartmentDto) {
    if (dto.parentDepartmentId) await this.findDepartment(companyId, dto.parentDepartmentId);
    if (dto.headEmployeeId) await this.assertActiveEmployee(companyId, dto.headEmployeeId);
    return this.prisma.$transaction(async (tx) => {
      const dept = await tx.department.create({
        data: {
          companyId,
          name: dto.name.trim(),
          parentDepartmentId: dto.parentDepartmentId ?? null,
          headEmployeeId: dto.headEmployeeId ?? null,
        },
      });
      await this.audit.record(tx, ctx, { tableName: 'departments', recordId: dept.id, action: 'create', newValue: dept });
      return dept;
    });
  }

  async updateDepartment(companyId: string, ctx: AuditContext, id: string, dto: UpdateDepartmentDto) {
    const before = await this.findDepartment(companyId, id);
    if (dto.parentDepartmentId !== undefined && dto.parentDepartmentId !== null) {
      await this.findDepartment(companyId, dto.parentDepartmentId);
      const cycle = await wouldCreateCycle(id, dto.parentDepartmentId, async (deptId) => {
        const d = await this.prisma.department.findUnique({ where: { id: deptId }, select: { parentDepartmentId: true } });
        return d?.parentDepartmentId ?? null;
      });
      if (cycle) throw new BadRequestException('Departemen induk membentuk siklus');
    }
    if (dto.headEmployeeId) await this.assertActiveEmployee(companyId, dto.headEmployeeId);

    return this.prisma.$transaction(async (tx) => {
      const after = await tx.department.update({
        where: { id },
        data: { name: dto.name?.trim(), parentDepartmentId: dto.parentDepartmentId, headEmployeeId: dto.headEmployeeId },
      });
      await this.audit.record(tx, ctx, { tableName: 'departments', recordId: id, action: 'update', oldValue: before, newValue: after });
      return after;
    });
  }

  async deleteDepartment(companyId: string, ctx: AuditContext, id: string) {
    const dept = await this.prisma.department.findFirst({
      where: { id, companyId },
      include: { _count: { select: { employees: true, positions: true, children: true } } },
    });
    if (!dept) throw new NotFoundException('Departemen tidak ditemukan');
    const { _count, ...row } = dept;
    if (_count.employees || _count.positions || _count.children) {
      throw new ConflictException('Departemen masih punya karyawan, jabatan, atau sub-departemen');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.department.delete({ where: { id } });
      await this.audit.record(tx, ctx, { tableName: 'departments', recordId: id, action: 'delete', oldValue: row });
    });
  }

  // ───────────── Position ─────────────

  listPositions(companyId: string, departmentId?: string) {
    return this.prisma.position.findMany({
      where: { department: { companyId }, ...(departmentId ? { departmentId } : {}) },
      include: { department: { select: { id: true, name: true } }, _count: { select: { employees: true } } },
      orderBy: [{ department: { name: 'asc' } }, { level: 'desc' }, { title: 'asc' }],
    });
  }

  async createPosition(companyId: string, ctx: AuditContext, dto: CreatePositionDto) {
    await this.findDepartment(companyId, dto.departmentId);
    return this.prisma.$transaction(async (tx) => {
      const pos = await tx.position.create({ data: { ...dto, title: dto.title.trim() } });
      await this.audit.record(tx, ctx, { tableName: 'positions', recordId: pos.id, action: 'create', newValue: pos });
      return pos;
    });
  }

  async updatePosition(companyId: string, ctx: AuditContext, id: string, dto: UpdatePositionDto) {
    const before = await this.findPosition(companyId, id);
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.position.update({ where: { id }, data: { ...dto, title: dto.title?.trim() } });
      await this.audit.record(tx, ctx, { tableName: 'positions', recordId: id, action: 'update', oldValue: before, newValue: after });
      return after;
    });
  }

  async deletePosition(companyId: string, ctx: AuditContext, id: string) {
    const pos = await this.findPosition(companyId, id);
    if (await this.prisma.employee.count({ where: { positionId: id } })) {
      throw new ConflictException('Jabatan masih dipakai karyawan');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.position.delete({ where: { id } });
      await this.audit.record(tx, ctx, { tableName: 'positions', recordId: id, action: 'delete', oldValue: pos });
    });
  }

  // ───────────── Work location ─────────────

  listWorkLocations(companyId: string) {
    return this.prisma.workLocation.findMany({ where: { companyId }, orderBy: { name: 'asc' } });
  }

  async createWorkLocation(companyId: string, ctx: AuditContext, dto: CreateWorkLocationDto) {
    this.assertTimeZone(dto.timezone);
    return this.prisma.$transaction(async (tx) => {
      const loc = await tx.workLocation.create({
        data: {
          companyId,
          name: dto.name.trim(),
          latitude: new Prisma.Decimal(dto.latitude),
          longitude: new Prisma.Decimal(dto.longitude),
          radiusMeters: dto.radiusMeters,
          timezone: dto.timezone,
        },
      });
      await this.audit.record(tx, ctx, { tableName: 'work_locations', recordId: loc.id, action: 'create', newValue: loc });
      return loc;
    });
  }

  async updateWorkLocation(companyId: string, ctx: AuditContext, id: string, dto: UpdateWorkLocationDto) {
    const before = await this.prisma.workLocation.findFirst({ where: { id, companyId } });
    if (!before) throw new NotFoundException('Lokasi kerja tidak ditemukan');
    if (dto.timezone) this.assertTimeZone(dto.timezone);
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.workLocation.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          latitude: dto.latitude === undefined ? undefined : new Prisma.Decimal(dto.latitude),
          longitude: dto.longitude === undefined ? undefined : new Prisma.Decimal(dto.longitude),
          radiusMeters: dto.radiusMeters,
          timezone: dto.timezone,
        },
      });
      await this.audit.record(tx, ctx, { tableName: 'work_locations', recordId: id, action: 'update', oldValue: before, newValue: after });
      return after;
    });
  }

  async deleteWorkLocation(companyId: string, ctx: AuditContext, id: string) {
    const loc = await this.prisma.workLocation.findFirst({ where: { id, companyId } });
    if (!loc) throw new NotFoundException('Lokasi kerja tidak ditemukan');
    if (await this.prisma.employee.count({ where: { workLocationId: id } })) {
      throw new ConflictException('Lokasi kerja masih dipakai karyawan');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.workLocation.delete({ where: { id } });
      await this.audit.record(tx, ctx, { tableName: 'work_locations', recordId: id, action: 'delete', oldValue: loc });
    });
  }

  // ───────────── Helpers (dipakai juga oleh modul employee) ─────────────

  async findDepartment(companyId: string, id: string, tx: Tx = this.prisma) {
    const dept = await tx.department.findFirst({ where: { id, companyId } });
    if (!dept) throw new NotFoundException('Departemen tidak ditemukan');
    return dept;
  }

  async findPosition(companyId: string, id: string, tx: Tx = this.prisma) {
    const pos = await tx.position.findFirst({ where: { id, department: { companyId } } });
    if (!pos) throw new NotFoundException('Jabatan tidak ditemukan');
    return pos;
  }

  private async assertActiveEmployee(companyId: string, employeeId: string) {
    const emp = await this.prisma.employee.findFirst({ where: { id: employeeId, companyId, employmentStatus: 'active' } });
    if (!emp) throw new BadRequestException('Kepala departemen harus karyawan aktif di perusahaan ini');
  }

  private assertTimeZone(tz: string) {
    if (!isValidTimeZone(tz)) throw new BadRequestException(`Zona waktu "${tz}" tidak dikenal (gunakan nama IANA, misal Asia/Jakarta)`);
  }
}
