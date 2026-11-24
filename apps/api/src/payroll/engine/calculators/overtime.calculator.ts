import { WorkPattern } from '@prisma/client';
import { RoundingFn, Rupiah } from '../money';
import { OvertimeInput, OvertimeRuleRow, RateNotFoundError } from '../types';

/**
 * Perhitungan lembur berdasarkan PP 35/2021.
 * - Upah per jam = dasar upah sebulan ÷ 173 (tidak dibulatkan).
 * - Jika (pokok + tunjangan tetap) < 75% total upah (termasuk tunjangan tidak tetap),
 *   dasar upah lembur = 75% × total upah.
 * - Pembulatan hanya dilakukan sekali di akhir.
 */
export function calculateOvertime(
  fixedMonthlyWage: Rupiah,
  variableAllowanceTotal: Rupiah,
  workPattern: WorkPattern,
  entries: OvertimeInput[],
  allRules: OvertimeRuleRow[],
  overtimeEligible: boolean,
  round: RoundingFn,
): Rupiah {
  if (!overtimeEligible || entries.length === 0) return 0;

  const totalWage = fixedMonthlyWage + variableAllowanceTotal;
  const wageBase =
    totalWage > 0 && fixedMonthlyWage < totalWage * 0.75 ? totalWage * 0.75 : fixedMonthlyWage;
  const hourlyWage = wageBase / 173;

  const patternRules = allRules.filter((r) => r.workPattern === workPattern);
  let total = 0;

  for (const entry of entries) {
    if (entry.hours <= 0) continue;
    const dayRules = patternRules
      .filter((r) => r.dayType === entry.dayType)
      .sort((a, b) => a.hourFrom - b.hourFrom);

    if (dayRules.length === 0) {
      throw new RateNotFoundError(`Aturan lembur untuk pola ${workPattern} dan jenis hari ${entry.dayType} tidak ditemukan`);
    }

    for (const rule of dayRules) {
      const upper = rule.hourTo ?? Infinity;
      const hoursInTier = Math.max(0, Math.min(entry.hours, upper) - (rule.hourFrom - 1));
      total += hoursInTier * rule.multiplier * hourlyWage;
    }
  }

  return round(total);
}
