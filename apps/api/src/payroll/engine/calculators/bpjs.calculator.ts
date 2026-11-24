import { RoundingFn, Rupiah } from '../money';
import { BpjsRateSet, RateNotFoundError } from '../types';

export interface BpjsOutput {
  wageBase: Rupiah;
  kesCompany: Rupiah;
  kesEmployeeBase: Rupiah;
  kesEmployeeExtraFamily: Rupiah;
  kesEmployeeTotal: Rupiah;
  jhtCompany: Rupiah;
  jhtEmployee: Rupiah;
  jkkCompany: Rupiah;
  jkmCompany: Rupiah;
  jpCompany: Rupiah;
  jpEmployee: Rupiah;
  /** Total dipotong dari gaji karyawan (Kes + JHT + JP). */
  totalEmployee: Rupiah;
  /** Total kontribusi perusahaan (Kes + JHT + JKK + JKM + JP). */
  totalCompany: Rupiah;
  /** Premi perusahaan yang masuk bruto PPh 21: BPJS Kesehatan + JKK + JKM (BUKAN JHT/JP). */
  taxableCompanyBenefit: Rupiah;
}

/**
 * Dasar iuran BPJS = gaji pokok + tunjangan tetap (tanpa lembur, THR, bonus, tunjangan tidak tetap).
 */
export function calculateBpjs(
  wageBase: Rupiah,
  minimumWage: Rupiah,
  riskClassJkk: string,
  extraFamilyMembers: number,
  rates: BpjsRateSet,
  round: RoundingFn,
): BpjsOutput {
  const jkkRate = rates.jkkByRiskClass[riskClassJkk];
  if (!jkkRate) {
    throw new RateNotFoundError(`Tarif JKK untuk kelas risiko "${riskClassJkk}" tidak ditemukan`);
  }

  const kesBase = Math.min(Math.max(wageBase, minimumWage), rates.kesehatan.wageCap);
  const kesCompany = round(kesBase * rates.kesehatan.companyPct);
  const kesEmployeeBase = round(kesBase * rates.kesehatan.employeePct);
  const kesEmployeeExtraFamily =
    extraFamilyMembers > 0 ? round(kesBase * rates.kesehatan.extraFamilyPct * extraFamilyMembers) : 0;
  const kesEmployeeTotal = kesEmployeeBase + kesEmployeeExtraFamily;

  const jpBase = Math.min(wageBase, rates.jp.wageCap);
  const jhtCompany = round(wageBase * rates.jht.companyPct);
  const jhtEmployee = round(wageBase * rates.jht.employeePct);
  const jkkCompany = round(wageBase * jkkRate.companyPct);
  const jkmCompany = round(wageBase * rates.jkm.companyPct);
  const jpCompany = round(jpBase * rates.jp.companyPct);
  const jpEmployee = round(jpBase * rates.jp.employeePct);

  const totalEmployee = kesEmployeeTotal + jhtEmployee + jpEmployee;
  const totalCompany = kesCompany + jhtCompany + jkkCompany + jkmCompany + jpCompany;
  const taxableCompanyBenefit = kesCompany + jkkCompany + jkmCompany;

  return {
    wageBase,
    kesCompany,
    kesEmployeeBase,
    kesEmployeeExtraFamily,
    kesEmployeeTotal,
    jhtCompany,
    jhtEmployee,
    jkkCompany,
    jkmCompany,
    jpCompany,
    jpEmployee,
    totalEmployee,
    totalCompany,
    taxableCompanyBenefit,
  };
}
