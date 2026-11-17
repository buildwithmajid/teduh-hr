import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface Grants {
  roles: { id: string; name: string; requiresMfa: boolean }[];
  permissions: string[];
}

@Injectable()
export class AuthzService {
  constructor(private readonly prisma: PrismaService) {}

  /** Role & permission user di satu perusahaan. */
  async getGrants(userId: string, companyId: string): Promise<Grants> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId, companyId },
      include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
    });
    const permissions = new Set<string>();
    for (const ur of userRoles) {
      for (const rp of ur.role.rolePermissions) permissions.add(rp.permission.code);
    }
    return {
      roles: userRoles.map((ur) => ({ id: ur.role.id, name: ur.role.name, requiresMfa: ur.role.requiresMfa })),
      permissions: [...permissions].sort(),
    };
  }

  /** Perusahaan tempat user punya minimal satu role. */
  async getCompanies(userId: string): Promise<{ id: string; name: string }[]> {
    const rows = await this.prisma.userRole.findMany({
      where: { userId },
      distinct: ['companyId'],
      select: { companyId: true, company: { select: { id: true, name: true } } },
    });
    return rows.map((r) => r.company).sort((a, b) => a.name.localeCompare(b.name));
  }
}

/** True jika `granted` mencakup semua `required`. */
export function hasAllPermissions(granted: readonly string[], required: readonly string[]): boolean {
  const set = new Set(granted);
  return required.every((p) => set.has(p));
}
