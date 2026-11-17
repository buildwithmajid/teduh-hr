import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser, PERMISSIONS_KEY } from '../common/auth-context';
import { hasAllPermissions } from './authz.service';
import { PermissionsGuard } from './guards';

function ctxWith(user: Partial<AuthUser> | undefined, required: string[] | undefined): [PermissionsGuard, ExecutionContext] {
  const handler = () => undefined;
  const reflector = new Reflector();
  if (required) Reflect.defineMetadata(PERMISSIONS_KEY, required, handler);
  const context = {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  return [new PermissionsGuard(reflector), context];
}

describe('PermissionsGuard', () => {
  it('lolos jika endpoint tidak butuh permission', () => {
    const [guard, ctx] = ctxWith({ permissions: [] }, undefined);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('lolos jika semua permission dimiliki', () => {
    const [guard, ctx] = ctxWith({ permissions: ['employee.view', 'employee.manage'] }, ['employee.manage']);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('menolak jika salah satu permission tidak dimiliki', () => {
    const [guard, ctx] = ctxWith({ permissions: ['employee.view'] }, ['employee.view', 'employee.view_sensitive']);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('menolak jika tidak ada user', () => {
    const [guard, ctx] = ctxWith(undefined, ['employee.view']);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});

describe('hasAllPermissions', () => {
  it('daftar kosong selalu terpenuhi', () => {
    expect(hasAllPermissions([], [])).toBe(true);
  });
  it('dipakai untuk cek role yang boleh di-assign (subset)', () => {
    expect(hasAllPermissions(['a', 'b', 'c'], ['a', 'c'])).toBe(true);
    expect(hasAllPermissions(['a'], ['a', 'company.create'])).toBe(false);
  });
});
