import { makeRounding } from './money';
import {
  NegativeTakeHomePayError,
  PayrollComponentLine,
  PayrollInput,
  PayrollResult,
} from './types';
import { calculateBpjs } from './calculators/bpjs.calculator';
import { calculateOtherDeductions } from './calculators/deduction.calculator';
import { calculateOvertime } from './calculators/overtime.calculator';
import { calculatePph21Ter, reconcileFinalPeriodPph21 } from './calculators/pph21.calculator';
import { calculateProrata } from './calculators/prorata.calculator';

/**
 * Orchestrator murni perhitungan payroll untuk satu karyawan pada satu periode.
 * Tanpa I/O, tanpa jam sistem, 100% deterministik.
 */
export function calculateEmployeePayroll(input: PayrollInput): PayrollResult {
  const round = makeRounding(input.policy.roundingMode);
  const components: PayrollComponentLine[] = [];

  // 1. Gaji pokok & tunjangan prorata
  const prorata = calculateProrata(
    input.employee.salarySegments,
    input.employee.variableAllowances,
    input.attendance,
    round,
  );
  components.push({ type: 'earning', code: 'base_salary', name: 'Gaji Pokok', amount: prorata.baseSalary });
  for (const fa of prorata.fixedAllowances) {
    if (fa.amount > 0) components.push({ type: 'earning', code: fa.code, name: fa.name, amount: fa.amount });
  }
  for (const va of prorata.variableAllowances) {
    if (va.amount > 0) components.push({ type: 'earning', code: va.code, name: va.name, amount: va.amount });
  }

  // 2. Lembur (dasar: upah bulanan penuh = pokok + tunjangan tetap)
  const overtimeAmount = calculateOvertime(
    prorata.fullMonthlyWageBase,
    prorata.variableAllowanceTotal,
    input.employee.workPattern,
    input.overtime,
    input.rates.overtimeRules,
    input.employee.overtimeEligible,
    round,
  );
  if (overtimeAmount > 0) {
    components.push({ type: 'earning', code: 'overtime', name: 'Upah Lembur', amount: overtimeAmount });
  }

  // 3. Penghasilan tidak teratur (THR, bonus)
  let irregularIncomeTotal = 0;
  let taxableIrregularTotal = 0;
  for (const irr of input.irregularIncome) {
    if (irr.amount <= 0) continue;
    irregularIncomeTotal += irr.amount;
    if (irr.isTaxable) taxableIrregularTotal += irr.amount;
    components.push({ type: 'earning', code: irr.code, name: irr.name, amount: irr.amount });
  }

  // 4. BPJS (dasar: upah tetap bulanan, BUKAN bruto & tanpa lembur)
  const bpjs = calculateBpjs(
    prorata.fullMonthlyWageBase,
    input.policy.minimumWage,
    input.policy.riskClassJkk,
    input.employee.bpjsExtraFamilyMembers,
    input.rates.bpjs,
    round,
  );

  if (bpjs.kesEmployeeTotal > 0) {
    components.push({ type: 'deduction', code: 'bpjs_kes_employee', name: 'BPJS Kesehatan (Karyawan)', amount: bpjs.kesEmployeeTotal });
  }
  if (bpjs.jhtEmployee > 0) {
    components.push({ type: 'deduction', code: 'jht_employee', name: 'BPJS JHT (Karyawan)', amount: bpjs.jhtEmployee });
  }
  if (bpjs.jpEmployee > 0) {
    components.push({ type: 'deduction', code: 'jp_employee', name: 'BPJS JP (Karyawan)', amount: bpjs.jpEmployee });
  }

  // Kontribusi perusahaan (taxable benefit masuk bruto pajak; non-taxable hanya kontribusi perusahaan)
  if (bpjs.kesCompany > 0) {
    components.push({ type: 'taxable_benefit', code: 'bpjs_kes_company', name: 'BPJS Kesehatan (Perusahaan)', amount: bpjs.kesCompany });
  }
  if (bpjs.jkkCompany > 0) {
    components.push({ type: 'taxable_benefit', code: 'jkk_company', name: 'BPJS JKK (Perusahaan)', amount: bpjs.jkkCompany });
  }
  if (bpjs.jkmCompany > 0) {
    components.push({ type: 'taxable_benefit', code: 'jkm_company', name: 'BPJS JKM (Perusahaan)', amount: bpjs.jkmCompany });
  }
  if (bpjs.jhtCompany > 0) {
    components.push({ type: 'company_contribution', code: 'jht_company', name: 'BPJS JHT (Perusahaan)', amount: bpjs.jhtCompany });
  }
  if (bpjs.jpCompany > 0) {
    components.push({ type: 'company_contribution', code: 'jp_company', name: 'BPJS JP (Perusahaan)', amount: bpjs.jpCompany });
  }

  // 5. Bruto PPh 21 = penghasilan tunai kena pajak (setelah potongan alpha) + premi JKK/JKM/BPJS Kes perusahaan
  const taxableFixed = prorata.fixedAllowances.filter((f) => f.isTaxable).reduce((s, f) => s + f.amount, 0);
  const taxableVar = prorata.variableAllowances.filter((v) => v.isTaxable).reduce((s, v) => s + v.amount, 0);
  const pph21Gross = Math.max(
    0,
    prorata.baseSalary +
      taxableFixed +
      taxableVar +
      overtimeAmount +
      taxableIrregularTotal -
      prorata.absenceDeduction +
      bpjs.taxableCompanyBenefit,
  );

  // 6. PPh 21 (TER bulanan atau rekonsiliasi Pasal 17 masa pajak akhir)
  let pph21Amount = 0;
  let pph21Refund = 0;
  let pph21Method: 'ter' | 'annual_reconciliation' = 'ter';

  if (input.period.isFinalTaxPeriod) {
    pph21Method = 'annual_reconciliation';
    const ytd = input.ytd ?? { bruto: 0, jhtEmployee: 0, jpEmployee: 0, pph21Paid: 0, monthsWorkedIncludingCurrent: 1 };
    const rec = reconcileFinalPeriodPph21(
      pph21Gross,
      bpjs.jhtEmployee,
      bpjs.jpEmployee,
      input.employee.ptkpStatus,
      ytd,
      input.rates,
      round,
    );
    pph21Amount = rec.pph21Amount;
    pph21Refund = rec.pph21Refund;
  } else {
    const ter = calculatePph21Ter(pph21Gross, input.employee.ptkpStatus, input.rates, round);
    pph21Amount = ter.pph21Amount;
  }

  if (pph21Amount > 0) {
    components.push({ type: 'deduction', code: 'pph21', name: 'PPh 21', amount: pph21Amount });
  }
  if (pph21Refund > 0) {
    components.push({ type: 'earning', code: 'pph21_refund', name: 'Pengembalian Lebih Potong PPh 21', amount: pph21Refund });
  }

  // 7. Potongan lain (alpha, kasbon, cicilan) dengan batas PP 36/2021
  const cashEarningsBeforeRefund =
    prorata.baseSalary +
    prorata.fixedAllowanceTotal +
    prorata.variableAllowanceTotal +
    overtimeAmount +
    irregularIncomeTotal;

  const otherDed = calculateOtherDeductions(
    cashEarningsBeforeRefund,
    prorata.absenceDeduction,
    input.deductions,
    input.policy.maxDeductionPct,
    round,
  );

  for (const d of otherDed.applied) {
    components.push({ type: 'deduction', code: d.code, name: d.name, amount: d.amount, referenceId: d.referenceId });
  }

  // 8. Take-home pay (tidak boleh negatif)
  const totalCashEarnings = cashEarningsBeforeRefund + pph21Refund;
  const totalDeductions = bpjs.totalEmployee + pph21Amount + otherDed.totalApplied;
  const netSalary = totalCashEarnings - totalDeductions;

  if (netSalary < 0) {
    throw new NegativeTakeHomePayError(
      `Take-home pay negatif (Rp${netSalary}): pendapatan Rp${totalCashEarnings}, potongan Rp${totalDeductions}`,
    );
  }

  return {
    baseSalary: prorata.baseSalary,
    fixedAllowanceTotal: prorata.fixedAllowanceTotal,
    variableAllowanceTotal: prorata.variableAllowanceTotal,
    overtimeAmount,
    irregularIncomeTotal,
    bpjsWageBase: bpjs.wageBase,
    bpjsKesEmployee: bpjs.kesEmployeeTotal,
    bpjsKesCompany: bpjs.kesCompany,
    jhtEmployee: bpjs.jhtEmployee,
    jhtCompany: bpjs.jhtCompany,
    jkkCompany: bpjs.jkkCompany,
    jkmCompany: bpjs.jkmCompany,
    jpEmployee: bpjs.jpEmployee,
    jpCompany: bpjs.jpCompany,
    pph21Gross,
    pph21Method,
    pph21Amount,
    pph21Refund,
    otherDeductionsTotal: otherDed.totalApplied,
    deferredDeductionIds: otherDed.deferredIds,
    netSalary,
    totalCompanyContribution: bpjs.totalCompany,
    components,
  };
}
