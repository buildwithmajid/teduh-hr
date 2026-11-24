import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { formatDateOnly, parseDateOnly } from '../../common/dates';
import { BpjsRateSet, PtkpRateRow, RateNotFoundError, RateSet, TerCategory } from '../engine/types';

/**
 * Memuat seluruh RateSet regulasi Indonesia dari database berdasarkan `periodEnd`
 * (bukan CURRENT_DATE), sekali per run payroll agar deterministik dan cepat.
 */
@Injectable()
export class RateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async loadRateSet(periodEndStr: string, companyId?: string): Promise<RateSet> {
    const asOf = parseDateOnly(periodEndStr);

    const [terVer, ptkpVer, progVer, bpjsVer, otVer] = await Promise.all([
      this.prisma.terRate.aggregate({ where: { berlakuSejak: { lte: asOf } }, _max: { berlakuSejak: true } }),
      this.prisma.ptkpRate.aggregate({ where: { berlakuSejak: { lte: asOf } }, _max: { berlakuSejak: true } }),
      this.prisma.pph21ProgressiveRate.aggregate({ where: { berlakuSejak: { lte: asOf } }, _max: { berlakuSejak: true } }),
      this.prisma.bpjsRate.aggregate({ where: { berlakuSejak: { lte: asOf } }, _max: { berlakuSejak: true } }),
      this.prisma.overtimeRule.aggregate({
        where: { berlakuSejak: { lte: asOf }, OR: [{ companyId: null }, ...(companyId ? [{ companyId }] : [])] },
        _max: { berlakuSejak: true },
      }),
    ]);

    if (!terVer._max.berlakuSejak || !ptkpVer._max.berlakuSejak || !progVer._max.berlakuSejak || !bpjsVer._max.berlakuSejak || !otVer._max.berlakuSejak) {
      throw new RateNotFoundError(`Tabel tarif regulasi untuk tanggal ${periodEndStr} belum lengkap di database (jalankan db:seed)`);
    }

    const [terRows, ptkpRows, progRows, bpjsRows, otRows] = await Promise.all([
      this.prisma.terRate.findMany({
        where: { berlakuSejak: terVer._max.berlakuSejak },
        orderBy: [{ kategori: 'asc' }, { batasBawah: 'asc' }],
      }),
      this.prisma.ptkpRate.findMany({ where: { berlakuSejak: ptkpVer._max.berlakuSejak } }),
      this.prisma.pph21ProgressiveRate.findMany({
        where: { berlakuSejak: progVer._max.berlakuSejak },
        orderBy: { batasBawah: 'asc' },
      }),
      this.prisma.bpjsRate.findMany({ where: { berlakuSejak: bpjsVer._max.berlakuSejak } }),
      this.prisma.overtimeRule.findMany({
        where: {
          berlakuSejak: otVer._max.berlakuSejak,
          OR: [{ companyId: null }, ...(companyId ? [{ companyId }] : [])],
        },
        orderBy: [{ workPattern: 'asc' }, { dayType: 'asc' }, { hourFrom: 'asc' }],
      }),
    ]);

    const ptkpRates: Record<string, PtkpRateRow> = {};
    for (const r of ptkpRows) {
      ptkpRates[r.status] = {
        status: r.status,
        amountPerYear: Number(r.amountPerYear),
        terCategory: r.terCategory.trim() as TerCategory,
      };
    }

    const kes = bpjsRows.find((b) => b.program === 'kesehatan');
    const jht = bpjsRows.find((b) => b.program === 'jht');
    const jkm = bpjsRows.find((b) => b.program === 'jkm');
    const jp = bpjsRows.find((b) => b.program === 'jp');
    if (!kes || !jht || !jkm || !jp) {
      throw new RateNotFoundError(`Tarif BPJS untuk tanggal ${periodEndStr} tidak lengkap`);
    }

    const jkkByRiskClass: Record<string, { companyPct: number }> = {};
    for (const r of bpjsRows.filter((b) => b.program === 'jkk' && b.riskClass)) {
      jkkByRiskClass[r.riskClass!] = { companyPct: Number(r.companyPercentage) };
    }

    const bpjs: BpjsRateSet = {
      kesehatan: {
        companyPct: Number(kes.companyPercentage),
        employeePct: Number(kes.employeePercentage),
        extraFamilyPct: Number(kes.extraFamilyPercentage ?? 0.01),
        wageCap: Number(kes.wageCap ?? 12_000_000),
      },
      jht: { companyPct: Number(jht.companyPercentage), employeePct: Number(jht.employeePercentage) },
      jkkByRiskClass,
      jkm: { companyPct: Number(jkm.companyPercentage) },
      jp: {
        companyPct: Number(jp.companyPercentage),
        employeePct: Number(jp.employeePercentage),
        wageCap: Number(jp.wageCap ?? 10_042_300),
      },
    };

    // Jika perusahaan punya override overtime_rules, utamakan yang milik companyId
    const companyOt = companyId ? otRows.filter((r) => r.companyId === companyId) : [];
    const effectiveOt = companyOt.length > 0 ? companyOt : otRows.filter((r) => r.companyId === null);

    return {
      effectiveAsOf: formatDateOnly(terVer._max.berlakuSejak),
      terRates: terRows.map((r) => ({
        kategori: r.kategori.trim() as TerCategory,
        batasBawah: Number(r.batasBawah),
        batasAtas: r.batasAtas === null ? null : Number(r.batasAtas),
        tarif: Number(r.tarif),
      })),
      ptkpRates,
      progressiveBrackets: progRows.map((r) => ({
        batasBawah: Number(r.batasBawah),
        batasAtas: r.batasAtas === null ? null : Number(r.batasAtas),
        tarif: Number(r.tarif),
      })),
      biayaJabatan: { pct: 0.05, maxPerMonth: 500_000 },
      bpjs,
      overtimeRules: effectiveOt.map((r) => ({
        workPattern: r.workPattern,
        dayType: r.dayType,
        hourFrom: r.hourFrom,
        hourTo: r.hourTo,
        multiplier: Number(r.multiplier),
      })),
    };
  }
}
