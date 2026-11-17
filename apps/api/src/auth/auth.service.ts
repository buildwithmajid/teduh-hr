import { BadRequestException, Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { AuditContext } from '../common/auth-context';
import { CryptoContext, FieldCrypto } from '../common/crypto/field-crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthzService } from './authz.service';
import { generateMfaSecret, mfaOtpAuthUrl, verifyMfaCode } from './mfa';
import { hashPassword, passwordPolicyViolation, verifyPassword } from './password';
import { SessionTokens, TokenService } from './token.service';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

export type LoginResult =
  | { status: 'ok'; session: SessionTokens }
  | { status: 'mfa_required' | 'mfa_setup_required'; mfaToken: string }
  | { status: 'company_selection_required'; companies: { id: string; name: string }[] };

@Injectable()
export class AuthService implements OnModuleInit {
  /** Hash dummy agar waktu respons sama untuk email yang tidak terdaftar (cegah enumerasi). */
  private dummyHash = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
    private readonly tokens: TokenService,
    private readonly crypto: FieldCrypto,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await hashPassword('dummy-password-for-timing-0');
  }

  async login(email: string, password: string, companyId: string | undefined, ctx: AuditContext): Promise<LoginResult> {
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });

    if (!user) {
      await verifyPassword(this.dummyHash, password);
      throw new UnauthorizedException('Email atau password salah');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException('Akun terkunci sementara karena terlalu banyak percobaan gagal');
    }

    const ok = await verifyPassword(user.passwordHash, password);
    if (!ok || !user.isActive) {
      if (!ok) await this.registerFailedLogin(user.id, user.failedLoginCount, ctx);
      throw new UnauthorizedException('Email atau password salah');
    }

    // Tentukan perusahaan aktif
    const companies = await this.authz.getCompanies(user.id);
    if (companies.length === 0) throw new UnauthorizedException('Akun belum punya akses ke perusahaan mana pun');
    let activeCompanyId: string;
    if (companyId) {
      if (!companies.some((c) => c.id === companyId)) throw new UnauthorizedException('Tidak punya akses ke perusahaan ini');
      activeCompanyId = companyId;
    } else if (companies.length === 1) {
      activeCompanyId = companies[0].id;
    } else {
      return { status: 'company_selection_required', companies };
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });

    const grants = await this.authz.getGrants(user.id, activeCompanyId);
    const mfaRequired = user.mfaEnabled || grants.roles.some((r) => r.requiresMfa);
    if (mfaRequired) {
      const purpose = user.mfaEnabled ? 'verify' : 'setup';
      const mfaToken = await this.tokens.signMfaToken({ sub: user.id, cid: activeCompanyId, purpose });
      return { status: user.mfaEnabled ? 'mfa_required' : 'mfa_setup_required', mfaToken };
    }

    return { status: 'ok', session: await this.completeLogin(user.id, activeCompanyId, ctx) };
  }

  /** Langkah 1 enrolment MFA: buat secret baru (disimpan sebagai pending sampai dikonfirmasi). */
  async setupMfa(mfaToken: string): Promise<{ otpauthUrl: string; secret: string }> {
    const payload = await this.tokens.verifyMfaToken(mfaToken, 'setup');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });
    if (user.mfaEnabled) throw new BadRequestException('MFA sudah aktif');
    const secret = generateMfaSecret();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { mfaPendingEncrypted: this.crypto.encrypt(secret, CryptoContext.mfaSecret) },
    });
    return { otpauthUrl: mfaOtpAuthUrl(user.email, secret), secret };
  }

  /** Langkah 2 enrolment MFA: konfirmasi kode dari aplikasi authenticator, lalu login. */
  async enableMfa(mfaToken: string, code: string, ctx: AuditContext): Promise<SessionTokens> {
    const payload = await this.tokens.verifyMfaToken(mfaToken, 'setup');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });
    if (!user.mfaPendingEncrypted) throw new BadRequestException('Jalankan setup MFA terlebih dahulu');
    const secret = this.crypto.decrypt(user.mfaPendingEncrypted, CryptoContext.mfaSecret);
    if (!verifyMfaCode(secret, code)) throw new UnauthorizedException('Kode MFA salah');

    const auditCtx = { ...ctx, userId: user.id, companyId: payload.cid };
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { mfaEnabled: true, mfaSecretEncrypted: user.mfaPendingEncrypted, mfaPendingEncrypted: null },
      });
      await this.audit.record(tx, auditCtx, {
        tableName: 'users',
        recordId: user.id,
        action: 'update',
        oldValue: { mfaEnabled: false },
        newValue: { mfaEnabled: true },
      });
    });
    return this.completeLogin(user.id, payload.cid, ctx);
  }

  async verifyMfa(mfaToken: string, code: string, ctx: AuditContext): Promise<SessionTokens> {
    const payload = await this.tokens.verifyMfaToken(mfaToken, 'verify');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });
    if (!user.isActive || !user.mfaEnabled || !user.mfaSecretEncrypted) throw new UnauthorizedException('MFA tidak aktif');
    const secret = this.crypto.decrypt(user.mfaSecretEncrypted, CryptoContext.mfaSecret);
    if (!verifyMfaCode(secret, code)) {
      await this.registerFailedLogin(user.id, user.failedLoginCount, ctx);
      throw new UnauthorizedException('Kode MFA salah');
    }
    return this.completeLogin(user.id, payload.cid, ctx);
  }

  async changePassword(userId: string, current: string, next: string, ctx: AuditContext): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await verifyPassword(user.passwordHash, current))) throw new UnauthorizedException('Password saat ini salah');
    const violation = passwordPolicyViolation(next, user.email);
    if (violation) throw new BadRequestException(violation);
    if (await verifyPassword(user.passwordHash, next)) throw new BadRequestException('Password baru harus berbeda');

    const passwordHash = await hashPassword(next);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.record(tx, ctx, {
        tableName: 'users',
        recordId: userId,
        action: 'update',
        newValue: { passwordChanged: true },
      });
    });
  }

  async me(userId: string, companyId: string) {
    const [user, grants, company] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          mfaEnabled: true,
          lastLoginAt: true,
          employee: { select: { id: true, companyId: true, fullName: true, employeeCode: true } },
        },
      }),
      this.authz.getGrants(userId, companyId),
      this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { id: true, name: true } }),
    ]);
    const employee = user.employee?.companyId === companyId ? user.employee : null;
    return {
      id: user.id,
      email: user.email,
      mfaEnabled: user.mfaEnabled,
      lastLoginAt: user.lastLoginAt,
      company,
      employee: employee && { id: employee.id, fullName: employee.fullName, employeeCode: employee.employeeCode },
      roles: grants.roles.map((r) => r.name),
      permissions: grants.permissions,
      companies: await this.authz.getCompanies(userId),
    };
  }

  private async completeLogin(userId: string, companyId: string, ctx: AuditContext): Promise<SessionTokens> {
    const session = await this.tokens.issueSession(userId, companyId, ctx);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null } });
      await this.audit.record(tx, { ...ctx, userId, companyId }, {
        tableName: 'users',
        recordId: userId,
        action: 'login',
        newValue: { result: 'success' },
      });
    });
    return session;
  }

  private async registerFailedLogin(userId: string, currentCount: number, ctx: AuditContext): Promise<void> {
    const failed = currentCount + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          failedLoginCount: lock ? 0 : failed,
          lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : undefined,
        },
      });
      await this.audit.record(tx, { ...ctx, userId }, {
        tableName: 'users',
        recordId: userId,
        action: 'login',
        newValue: { result: 'failed', locked: lock },
      });
    });
  }
}
