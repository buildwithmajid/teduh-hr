import { computeAuditHash, HashableAuditEntry, stableStringify, toJsonSafe } from './audit-hash';

const entry = (over: Partial<HashableAuditEntry> = {}): HashableAuditEntry => ({
  companyId: 'c1',
  userId: 'u1',
  tableName: 'employees',
  recordId: 'e1',
  action: 'update',
  oldValue: { a: 1, b: { y: 2, x: 1 } },
  newValue: { b: { x: 1, y: 3 }, a: 1 },
  ipAddress: '127.0.0.1',
  userAgent: 'jest',
  createdAt: new Date('2026-11-17T01:02:03.456Z'),
  ...over,
});

describe('audit hash', () => {
  it('stableStringify tidak bergantung urutan key', () => {
    expect(stableStringify({ b: 1, a: [{ d: 1, c: 2 }] })).toBe(stableStringify({ a: [{ c: 2, d: 1 }], b: 1 }));
  });

  it('toJsonSafe mengubah BigInt & Date', () => {
    expect(toJsonSafe({ id: 10n, at: new Date('2026-01-01T00:00:00Z') })).toEqual({
      id: '10',
      at: '2026-01-01T00:00:00.000Z',
    });
  });

  it('hash sama untuk isi sama walau urutan key berbeda (seperti setelah dibaca dari JSONB)', () => {
    const reordered = entry({ oldValue: { b: { x: 1, y: 2 }, a: 1 } });
    expect(computeAuditHash('p', entry())).toBe(computeAuditHash('p', reordered));
  });

  it('hash berubah jika isi atau prevHash berubah', () => {
    const base = computeAuditHash('p', entry());
    expect(computeAuditHash('q', entry())).not.toBe(base);
    expect(computeAuditHash('p', entry({ newValue: { a: 2 } }))).not.toBe(base);
    expect(computeAuditHash(null, entry())).not.toBe(base);
  });
});
