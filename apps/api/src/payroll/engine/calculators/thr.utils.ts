/**
 * Kalkulator THR Keagamaan sesuai Permenaker No. 6 Tahun 2016:
 * - Masa kerja >= 12 bulan secara terus-menerus: 1 bulan upah (gaji pokok + tunjangan tetap).
 * - Masa kerja >= 1 bulan tetapi < 12 bulan: proporsional (masaKerjaBulan / 12) × 1 bulan upah.
 * - Masa kerja < 1 bulan: Rp 0 (belum berhak THR).
 */
export interface ThrCalculationResult {
  serviceMonths: number;
  eligible: boolean;
  isProrated: boolean;
  amount: number;
}

export function calculateServiceMonths(joinDate: Date, referenceDate: Date): number {
  const jY = joinDate.getUTCFullYear();
  const jM = joinDate.getUTCMonth();
  const jD = joinDate.getUTCDate();

  const rY = referenceDate.getUTCFullYear();
  const rM = referenceDate.getUTCMonth();
  const rD = referenceDate.getUTCDate();

  let months = (rY - jY) * 12 + (rM - jM);
  if (rD < jD) months -= 1;
  return Math.max(0, months);
}

export function calculateThr(
  monthlyWage: number,
  joinDate: Date,
  referenceDate: Date,
): ThrCalculationResult {
  if (monthlyWage <= 0 || referenceDate.getTime() < joinDate.getTime()) {
    return { serviceMonths: 0, eligible: false, isProrated: false, amount: 0 };
  }

  const serviceMonths = calculateServiceMonths(joinDate, referenceDate);
  if (serviceMonths < 1) {
    return { serviceMonths, eligible: false, isProrated: false, amount: 0 };
  }

  if (serviceMonths >= 12) {
    return {
      serviceMonths,
      eligible: true,
      isProrated: false,
      amount: Math.round(monthlyWage),
    };
  }

  return {
    serviceMonths,
    eligible: true,
    isProrated: true,
    amount: Math.round((serviceMonths / 12) * monthlyWage),
  };
}
