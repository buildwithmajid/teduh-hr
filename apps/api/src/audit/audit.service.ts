import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { AuditContext } from '../common/auth-context';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { computeAuditHash, toJsonSafe } from './audit-hash';

/** Kunci advisory lock untuk menyerialkan penulisan rantai hash audit. */
const AUDIT_CHAIN_LOCK = 774_210_001;

export interface AuditEntry {
  tableName: string;
  recordId: string;
  action: AuditAction;
  oldValue?: unknown;
  newValue?: unknown;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Catat audit di dalam transaksi yang sama dengan perubahan datanya, supaya
   * perubahan & log selalu tersimpan bersama atau gagal bersama.
   *
   * Nilai yang dicatat adalah baris apa adanya di database — kolom sensitif sudah
   * berupa ciphertext, sehingga audit log tidak membocorkan plaintext.
   */
  async record(tx: Tx, ctx: AuditContext, entry: AuditEntry): Promise<void> {
    // Serialkan penulisan agar prev_hash selalu baris terakhir. Lock dilepas saat transaksi selesai.
    // $executeRaw karena fungsi ini mengembalikan void (tidak bisa dideserialisasi oleh $queryRaw).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK})`;
    const last = await tx.auditLog.findFirst({ orderBy: { id: 'desc' }, select: { rowHash: true } });
    const prevHash = last?.rowHash ?? null;
    const createdAt = new Date();
    const oldValue = entry.oldValue === undefined ? null : toJsonSafe(entry.oldValue);
    const newValue = entry.newValue === undefined ? null : toJsonSafe(entry.newValue);

    const rowHash = computeAuditHash(prevHash, {
      companyId: ctx.companyId,
      userId: ctx.userId,
      tableName: entry.tableName,
      recordId: entry.recordId,
      action: entry.action,
      oldValue,
      newValue,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      createdAt,
    });

    await tx.auditLog.create({
      data: {
        companyId: ctx.companyId,
        userId: ctx.userId,
        tableName: entry.tableName,
        recordId: entry.recordId,
        action: entry.action,
        oldValue: oldValue === null ? Prisma.DbNull : (oldValue as Prisma.InputJsonValue),
        newValue: newValue === null ? Prisma.DbNull : (newValue as Prisma.InputJsonValue),
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        prevHash,
        rowHash,
        createdAt,
      },
    });
  }

  /** Untuk event tanpa perubahan data lain (login, melihat data sensitif). */
  async recordStandalone(ctx: AuditContext, entry: AuditEntry): Promise<void> {
    await this.prisma.$transaction((tx) => this.record(tx, ctx, entry));
  }

  async list(companyId: string, filter: { tableName?: string; recordId?: string; skip: number; take: number }) {
    const where: Prisma.AuditLogWhereInput = {
      companyId,
      ...(filter.tableName ? { tableName: filter.tableName } : {}),
      ...(filter.recordId ? { recordId: filter.recordId } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({ where, orderBy: { id: 'desc' }, skip: filter.skip, take: filter.take }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items: items.map((i) => ({ ...i, id: i.id.toString() })), total };
  }

  /**
   * Hitung ulang seluruh rantai hash. Mengembalikan id baris pertama yang tidak cocok
   * (data diubah langsung di database, atau baris dihapus).
   */
  async verifyChain(batchSize = 1000): Promise<{ valid: boolean; checked: number; brokenAtId: string | null }> {
    let prevHash: string | null = null;
    let cursor: bigint | undefined;
    let checked = 0;

    for (;;) {
      const rows = await this.prisma.auditLog.findMany({
        orderBy: { id: 'asc' },
        take: batchSize,
        ...(cursor !== undefined ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (rows.length === 0) break;

      for (const row of rows) {
        const expected = computeAuditHash(prevHash, {
          companyId: row.companyId,
          userId: row.userId,
          tableName: row.tableName,
          recordId: row.recordId,
          action: row.action,
          oldValue: row.oldValue,
          newValue: row.newValue,
          ipAddress: row.ipAddress,
          userAgent: row.userAgent,
          createdAt: row.createdAt,
        });
        if (row.prevHash !== prevHash || row.rowHash !== expected) {
          return { valid: false, checked, brokenAtId: row.id.toString() };
        }
        prevHash = row.rowHash;
        checked++;
      }
      cursor = rows[rows.length - 1].id;
    }
    return { valid: true, checked, brokenAtId: null };
  }
}
