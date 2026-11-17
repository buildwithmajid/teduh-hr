import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { AuthzService } from './authz.service';
import { AccessTokenPayload } from './guards';

export interface SessionTokens {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface MfaTokenPayload {
  sub: string;
  cid: string;
  typ: 'mfa';
  purpose: 'verify' | 'setup';
}

interface ClientMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async issueSession(userId: string, companyId: string, meta: ClientMeta, familyId: string = randomUUID()): Promise<SessionTokens> {
    const payload: AccessTokenPayload = { sub: userId, cid: companyId, typ: 'access' };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.jwtAccessSecret,
      expiresIn: this.config.accessTokenTtlSeconds,
      algorithm: 'HS256',
    });
    const refreshToken = randomBytes(32).toString('base64url');
    const refreshExpiresAt = new Date(Date.now() + this.config.refreshTokenTtlDays * 86_400_000);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        companyId,
        familyId,
        tokenHash: sha256(refreshToken),
        expiresAt: refreshExpiresAt,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    });
    return { accessToken, expiresIn: this.config.accessTokenTtlSeconds, refreshToken, refreshExpiresAt };
  }

  /**
   * Rotasi refresh token. Token lama hanya bisa dipakai sekali; jika token yang sudah
   * dirotasi/dicabut dipakai lagi, seluruh family dicabut (indikasi token dicuri).
   */
  async rotate(refreshToken: string, meta: ClientMeta): Promise<SessionTokens> {
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(refreshToken) } });
    if (!existing) throw new UnauthorizedException('Sesi tidak valid');

    if (existing.rotatedAt || existing.revokedAt) {
      await this.revokeFamily(existing.familyId);
      throw new UnauthorizedException('Sesi tidak valid');
    }
    if (existing.expiresAt <= new Date()) throw new UnauthorizedException('Sesi kedaluwarsa');

    // Tandai terpakai secara atomik — request paralel dengan token sama hanya satu yang menang.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: existing.id, rotatedAt: null, revokedAt: null },
      data: { rotatedAt: new Date() },
    });
    if (claimed.count === 0) {
      await this.revokeFamily(existing.familyId);
      throw new UnauthorizedException('Sesi tidak valid');
    }

    const user = await this.prisma.user.findUnique({ where: { id: existing.userId }, select: { isActive: true } });
    const grants = await this.authz.getGrants(existing.userId, existing.companyId);
    if (!user?.isActive || grants.roles.length === 0) {
      await this.revokeFamily(existing.familyId);
      throw new UnauthorizedException('Akun tidak aktif');
    }
    return this.issueSession(existing.userId, existing.companyId, meta, existing.familyId);
  }

  async revokeByToken(refreshToken: string): Promise<void> {
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(refreshToken) } });
    if (existing) await this.revokeFamily(existing.familyId);
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  signMfaToken(payload: Omit<MfaTokenPayload, 'typ'>): Promise<string> {
    return this.jwt.signAsync({ ...payload, typ: 'mfa' } satisfies MfaTokenPayload, {
      secret: this.config.jwtMfaSecret,
      expiresIn: 300,
      algorithm: 'HS256',
    });
  }

  async verifyMfaToken(token: string, purpose: MfaTokenPayload['purpose']): Promise<MfaTokenPayload> {
    try {
      const payload = await this.jwt.verifyAsync<MfaTokenPayload>(token, {
        secret: this.config.jwtMfaSecret,
        algorithms: ['HS256'],
      });
      if (payload.typ !== 'mfa' || payload.purpose !== purpose) throw new Error('purpose');
      return payload;
    } catch {
      throw new UnauthorizedException('Token MFA tidak valid atau kedaluwarsa');
    }
  }
}
