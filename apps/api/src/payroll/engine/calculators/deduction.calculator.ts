import { RoundingFn, Rupiah } from '../money';
import { DeductionInput } from '../types';

export interface DeductionResult {
  applied: { code: string; name: string; amount: Rupiah; referenceId?: string }[];
  deferredIds: string[];
  totalApplied: Rupiah;
}

/**
 * Potongan non-wajib (di luar pajak & BPJS): potongan alpha/unpaid, kasbon, cicilan pinjaman.
 * Dibatasi maksimal `maxDeductionPct` (PP 36/2021: 50%) dari upah yang dibayarkan.
 * Cicilan yang melampaui batas digeser (`deferredIds`) ke periode berikutnya.
 */
export function calculateOtherDeductions(
  paidCashEarnings: Rupiah,
  absenceDeduction: Rupiah,
  inputs: DeductionInput[],
  maxDeductionPct: number,
  round: RoundingFn,
): DeductionResult {
  const maxAllowed = round(Math.max(0, paidCashEarnings) * maxDeductionPct);
  const applied: { code: string; name: string; amount: Rupiah; referenceId?: string }[] = [];
  const deferredIds: string[] = [];
  let running = 0;

  // 1. Potongan alpha / unpaid leave selalu diterapkan terlebih dahulu (tidak bisa di-defer)
  if (absenceDeduction > 0) {
    applied.push({ code: 'absence_deduction', name: 'Potongan Alpha / Cuti Tidak Dibayar', amount: absenceDeduction });
    running += absenceDeduction;
  }

  // 2. Potongan non-deferrable lain
  for (const d of inputs.filter((x) => !x.deferrable && x.amount > 0)) {
    applied.push({ code: d.code, name: d.name, amount: d.amount, referenceId: d.id });
    running += d.amount;
  }

  // 3. Cicilan / kasbon yang bisa digeser jika melampaui batas PP 36/2021
  for (const d of inputs.filter((x) => x.deferrable && x.amount > 0)) {
    if (running + d.amount <= maxAllowed) {
      applied.push({ code: d.code, name: d.name, amount: d.amount, referenceId: d.id });
      running += d.amount;
    } else if (d.id) {
      deferredIds.push(d.id);
    }
  }

  return { applied, deferredIds, totalApplied: running };
}
