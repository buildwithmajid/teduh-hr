import { floorThousands, RoundingFn, Rupiah } from '../money';
import { ProgressiveBracket, RateNotFoundError, RateSet, TaxYtd, TerCategory, TerRateRow } from '../types';

export function findTerRate(table: TerRateRow[], kategori: TerCategory, bruto: Rupiah): number {
  const row = table.find(
    (r) => r.kategori === kategori && r.batasBawah <= bruto && (r.batasAtas === null || bruto <= r.batasAtas),
  );
  if (!row) {
    throw new RateNotFoundError(`Tarif TER kategori ${kategori} untuk bruto Rp${bruto} tidak ditemukan`);
  }
  return row.tarif;
}

export function calculatePph21Ter(
  bruto: Rupiah,
  ptkpStatus: string,
  rates: RateSet,
  round: RoundingFn,
): { pph21Amount: Rupiah; rate: number; category: TerCategory } {
  const ptkp = rates.ptkpRates[ptkpStatus];
  if (!ptkp) {
    throw new RateNotFoundError(`Status PTKP "${ptkpStatus}" tidak ditemukan di tabel tarif`);
  }
  if (bruto <= 0) return { pph21Amount: 0, rate: 0, category: ptkp.terCategory };
  const rate = findTerRate(rates.terRates, ptkp.terCategory, bruto);
  return { pph21Amount: round(bruto * rate), rate, category: ptkp.terCategory };
}

export function calculateProgressiveTax(pkp: Rupiah, brackets: ProgressiveBracket[], round: RoundingFn): Rupiah {
  if (pkp <= 0) return 0;
  const sorted = [...brackets].sort((a, b) => a.batasBawah - b.batasBawah);
  let tax = 0;
  let lower = 0;
  for (const b of sorted) {
    if (pkp <= lower) break;
    const upper = b.batasAtas ?? Infinity;
    const slice = Math.max(0, Math.min(pkp, upper) - lower);
    tax += slice * b.tarif;
    lower = upper;
  }
  return round(tax);
}

/**
 * Rekonsiliasi masa pajak terakhir (Desember atau bulan terakhir bekerja) memakai Pasal 17.
 * Kelebihan potong dikembalikan ke karyawan sebagai `pph21Refund` (earning).
 */
export function reconcileFinalPeriodPph21(
  brutoBulanIni: Rupiah,
  jhtEmployeeBulanIni: Rupiah,
  jpEmployeeBulanIni: Rupiah,
  ptkpStatus: string,
  ytd: TaxYtd,
  rates: RateSet,
  round: RoundingFn,
): {
  annualBruto: Rupiah;
  biayaJabatan: Rupiah;
  annualDeductions: Rupiah;
  netto: Rupiah;
  pkp: Rupiah;
  annualTax: Rupiah;
  alreadyPaid: Rupiah;
  pph21Amount: Rupiah;
  pph21Refund: Rupiah;
} {
  const ptkp = rates.ptkpRates[ptkpStatus];
  if (!ptkp) {
    throw new RateNotFoundError(`Status PTKP "${ptkpStatus}" tidak ditemukan di tabel tarif`);
  }

  const annualBruto = ytd.bruto + brutoBulanIni + (ytd.previousEmployerBruto ?? 0);
  const biayaJabatan = Math.min(
    round(annualBruto * rates.biayaJabatan.pct),
    rates.biayaJabatan.maxPerMonth * Math.max(1, ytd.monthsWorkedIncludingCurrent),
  );
  const annualDeductions = ytd.jhtEmployee + ytd.jpEmployee + jhtEmployeeBulanIni + jpEmployeeBulanIni;
  const netto = Math.max(0, annualBruto - biayaJabatan - annualDeductions);
  const pkp = floorThousands(Math.max(0, netto - ptkp.amountPerYear));

  const annualTax = calculateProgressiveTax(pkp, rates.progressiveBrackets, round);
  const alreadyPaid = ytd.pph21Paid + (ytd.previousEmployerPph21 ?? 0);
  const diff = annualTax - alreadyPaid;

  return {
    annualBruto,
    biayaJabatan,
    annualDeductions,
    netto,
    pkp,
    annualTax,
    alreadyPaid,
    pph21Amount: Math.max(0, diff),
    pph21Refund: Math.max(0, -diff),
  };
}
