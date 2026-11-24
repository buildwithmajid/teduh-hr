import { RoundingFn, Rupiah } from '../money';
import { AttendanceSummary, SalarySegment, VariableAllowanceInput } from '../types';

export interface ProrataOutput {
  /** Gaji pokok setelah prorata seluruh segmen. */
  baseSalary: Rupiah;
  /** Tunjangan tetap setelah prorata per kode komponen. */
  fixedAllowances: { code: string; name: string; amount: Rupiah; isTaxable: boolean }[];
  fixedAllowanceTotal: Rupiah;
  /** Tunjangan tidak tetap (nominal tetap atau per hari hadir). */
  variableAllowances: { code: string; name: string; amount: Rupiah; isTaxable: boolean }[];
  variableAllowanceTotal: Rupiah;
  /** Upah bulanan penuh (dasar BPJS & lembur) = gaji pokok + tunjangan tetap segmen terakhir. */
  fullMonthlyWageBase: Rupiah;
  /** Potongan alpha & cuti tidak dibayar (dihitung dari upah penuh ÷ hari periode). */
  absenceDeduction: Rupiah;
}

export function calculateProrata(
  segments: SalarySegment[],
  variableInputs: VariableAllowanceInput[],
  attendance: AttendanceSummary,
  round: RoundingFn,
): ProrataOutput {
  if (segments.length === 0) throw new Error('Minimal satu salarySegment diperlukan');
  const denom = attendance.periodTotalDays;
  if (denom <= 0) throw new Error('periodTotalDays harus > 0');

  let baseRaw = 0;
  const fixedMap = new Map<string, { code: string; name: string; raw: number; isTaxable: boolean }>();

  for (const seg of segments) {
    const ratio = seg.activeDays / denom;
    baseRaw += seg.baseSalary * ratio;
    for (const fa of seg.fixedAllowances) {
      const prev = fixedMap.get(fa.code);
      if (prev) {
        prev.raw += fa.amount * ratio;
      } else {
        fixedMap.set(fa.code, { code: fa.code, name: fa.name, raw: fa.amount * ratio, isTaxable: fa.isTaxable });
      }
    }
  }

  const baseSalary = round(baseRaw);
  const fixedAllowances = [...fixedMap.values()].map((f) => ({
    code: f.code,
    name: f.name,
    amount: round(f.raw),
    isTaxable: f.isTaxable,
  }));
  const fixedAllowanceTotal = fixedAllowances.reduce((s, f) => s + f.amount, 0);

  const variableAllowances = variableInputs.map((v) => ({
    code: v.code,
    name: v.name,
    amount: v.calculation === 'per_attendance_day' ? round(v.rateAmount * attendance.presentDays) : v.rateAmount,
    isTaxable: v.isTaxable,
  }));
  const variableAllowanceTotal = variableAllowances.reduce((s, v) => s + v.amount, 0);

  // Dasar BPJS & lembur memakai upah bulanan (gaji pokok + tunjangan tetap) segmen terbaru
  const latest = segments[segments.length - 1];
  const fullMonthlyWageBase = latest.baseSalary + latest.fixedAllowances.reduce((s, f) => s + f.amount, 0);

  // Potongan alpha & cuti tidak dibayar (memakai upah tetap ÷ hari periode)
  const unpaidDays = Math.max(0, attendance.absentDays) + Math.max(0, attendance.unpaidLeaveDays);
  const absenceDeduction = unpaidDays > 0 ? round((fullMonthlyWageBase * unpaidDays) / denom) : 0;

  return {
    baseSalary,
    fixedAllowances,
    fixedAllowanceTotal,
    variableAllowances,
    variableAllowanceTotal,
    fullMonthlyWageBase,
    absenceDeduction,
  };
}
