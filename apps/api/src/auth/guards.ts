import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { AuthedRequest, IS_PUBLIC_KEY, PERMISSIONS_KEY } from '../common/auth-context';
import { PrismaService } from '../prisma/prisma.service';
import { AuthzService, hasAllPermissions } from './authz.service';

export interface AccessTokenPayload {
  sub: string;
  cid: string;
  typ: 'access';
}

/**
 * Guard global: memverifikasi access token, lalu memuat ulang status user & permission
 * dari database di setiap request (sehingga pencabutan role/akun langsung berlaku).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Token tidak ada');

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(header.slice(7), {
        secret: this.config.jwtAccessSecret,
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Token tidak valid atau kedaluwarsa');
    }
    if (payload.typ !== 'access') throw new UnauthorizedException('Jenis token salah');

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, isActive: true, employee: { select: { id: true, companyId: true } } },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('Akun tidak aktif');

    const grants = await this.authz.getGrants(user.id, payload.cid);
    if (grants.roles.length === 0) throw new UnauthorizedException('Tidak punya akses ke perusahaan ini');

    req.user = {
      userId: user.id,
      email: user.email,
      companyId: payload.cid,
      // Karyawan hanya terhubung bila berada di perusahaan aktif
      employeeId: user.employee?.companyId === payload.cid ? user.employee.id : null,
      roles: grants.roles.map((r) => r.name),
      permissions: grants.permissions,
    };
    return true;
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);
    if (!required || required.length === 0) return true;
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (!req.user || !hasAllPermissions(req.user.permissions, required)) {
      throw new ForbiddenException(`Butuh permission: ${required.join(', ')}`);
    }
    return true;
  }
}
