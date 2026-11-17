import { createHash } from 'crypto';

/** Ubah nilai apa pun (Date, Decimal, BigInt) menjadi bentuk JSON biasa. */
export function toJsonSafe(value: unknown): unknown {
  if (value === undefined) return null;
  return JSON.parse(
    JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v)),
  );
}

/** JSON dengan urutan key terurut, supaya hash tidak bergantung urutan properti (JSONB mengubah urutan). */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export interface HashableAuditEntry {
  companyId: string | null;
  userId: string | null;
  tableName: string;
  recordId: string;
  action: string;
  oldValue: unknown;
  newValue: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export function computeAuditHash(prevHash: string | null, entry: HashableAuditEntry): string {
  const payload = stableStringify({
    prevHash,
    companyId: entry.companyId,
    userId: entry.userId,
    tableName: entry.tableName,
    recordId: entry.recordId,
    action: entry.action,
    oldValue: toJsonSafe(entry.oldValue),
    newValue: toJsonSafe(entry.newValue),
    ipAddress: entry.ipAddress,
    userAgent: entry.userAgent,
    createdAt: entry.createdAt.toISOString(),
  });
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}
