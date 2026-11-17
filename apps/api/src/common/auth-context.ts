import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

/** User yang sudah terautentikasi, dipasang oleh JwtAuthGuard di `req.user`. */
export interface AuthUser {
  userId: string;
  email: string;
  companyId: string;
  employeeId: string | null;
  roles: string[];
  permissions: string[];
}

/** Informasi pelaku untuk audit log. */
export interface AuditContext {
  userId: string | null;
  companyId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export type AuthedRequest = Request & { user?: AuthUser };

export const IS_PUBLIC_KEY = 'isPublic';
/** Endpoint tanpa autentikasi (login, refresh, health). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = 'requiredPermissions';
/** Semua permission yang disebut wajib dimiliki user di perusahaan aktif. */
export const RequirePermissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.user) throw new Error('CurrentUser dipakai di endpoint tanpa autentikasi');
  return req.user;
});

export function auditContextFromRequest(req: AuthedRequest): AuditContext {
  return {
    userId: req.user?.userId ?? null,
    companyId: req.user?.companyId ?? null,
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  };
}

export const Audit = createParamDecorator((_: unknown, ctx: ExecutionContext): AuditContext =>
  auditContextFromRequest(ctx.switchToHttp().getRequest<AuthedRequest>()),
);
