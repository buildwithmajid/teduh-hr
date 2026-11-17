import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Regex untuk validator tanggal YYYY-MM-DD di DTO. */
export const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const DATE_ONLY_MESSAGE = '$property harus berformat YYYY-MM-DD';

export const PTKP_STATUSES = ['TK/0', 'TK/1', 'TK/2', 'TK/3', 'K/0', 'K/1', 'K/2', 'K/3'] as const;

export class PaginationQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export function paginate(q: PaginationQuery): { skip: number; take: number } {
  return { skip: (q.page - 1) * q.pageSize, take: q.pageSize };
}

/**
 * Cek apakah menjadikan `newParentId` sebagai induk/atasan dari `nodeId` membentuk siklus.
 * `getParent` mengembalikan induk dari sebuah node (atau null di puncak).
 */
export async function wouldCreateCycle(
  nodeId: string,
  newParentId: string | null,
  getParent: (id: string) => Promise<string | null>,
  maxDepth = 100,
): Promise<boolean> {
  let current = newParentId;
  for (let depth = 0; current !== null; depth++) {
    if (current === nodeId) return true;
    if (depth >= maxDepth) return true; // hierarki terlalu dalam dianggap tidak valid
    current = await getParent(current);
  }
  return false;
}
