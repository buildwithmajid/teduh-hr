import { OvertimeDayType, ProrataMethod, RoundingMode, WorkPattern } from '@prisma/client';
import { Rupiah } from './money';

export type TerCategory = 'A' | 'B' | 'C';

export class RateNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateNotFoundError';
  }
}

export class NegativeTakeHomePayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NegativeTakeHomePayError';
  }
}

export interface SalarySegment {
  /** Gaji pokok bulanan penuh pada segmen ini. */
  baseSalary: Rupiah;
  /** Tunjangan tetap bulanan penuh pada segmen ini (masuk dasar BPJS & lembur). */
  fixedAllowances: { code: string; name: string; amount: Rupiah; isTaxable: boolean }[];
  /** Jumlah hari aktif (hari kerja atau hari kalender sesuai prorataMethod) pada segmen ini. */
  activeDays: number;
}

export interface VariableAllowanceInput {
  code: string;
  name: string;
  calculation: 'fixed_amount' | 'per_attendance_day';
  rateAmount: Rupiah;
  isTaxable: boolean;
}

export interface AttendanceSummary {
  /** Total hari kerja/kalender penuh dalam satu periode payroll (penyebut prorata). */
  periodTotalDays: number;
  /** Jumlah hari hadir aktual (untuk komponen per_attendance_day). */
  presentDays: number;
  /** Jumlah hari alpha (tanpa keterangan) — tidak termasuk hari di luar masa aktif join/resign. */
  absentDays: number;
  /** Jumlah hari cuti tidak dibayar (unpaid leave). */
  unpaidLeaveDays: number;
}

export interface OvertimeInput {
  id?: string;
  dayType: OvertimeDayType;
  hours: number;
}

export interface IrregularIncomeInput {
  code: string;
  name: string;
  amount: Rupiah;
  isTaxable: boolean;
}

export interface DeductionInput {
  id?: string;
  code: string;
  name: string;
  amount: Rupiah;
  /** Cicilan pinjaman/kasbon dapat digeser (deferred) jika melebihi batas potongan PP 36/2021. */
  deferrable: boolean;
}

export interface TaxYtd {
  bruto: Rupiah;
  jhtEmployee: Rupiah;
  jpEmployee: Rupiah;
  pph21Paid: Rupiah;
  monthsWorkedIncludingCurrent: number;
  previousEmployerBruto?: Rupiah;
  previousEmployerPph21?: Rupiah;
}

export interface TerRateRow {
  kategori: TerCategory;
  batasBawah: Rupiah;
  batasAtas: Rupiah | null;
  tarif: number; // misal 0.02 = 2%
}

export interface PtkpRateRow {
  status: string;
  amountPerYear: Rupiah;
  terCategory: TerCategory;
}

export interface ProgressiveBracket {
  batasBawah: Rupiah;
  batasAtas: Rupiah | null;
  tarif: number;
}

export interface BpjsRateSet {
  kesehatan: {
    companyPct: number;
    employeePct: number;
    extraFamilyPct: number;
    wageCap: Rupiah;
  };
  jht: { companyPct: number; employeePct: number };
  jkkByRiskClass: Record<string, { companyPct: number }>;
  jkm: { companyPct: number };
  jp: { companyPct: number; employeePct: number; wageCap: Rupiah };
}

export interface OvertimeRuleRow {
  workPattern: WorkPattern;
  dayType: OvertimeDayType;
  hourFrom: number;
  hourTo: number | null;
  multiplier: number;
}

export interface RateSet {
  effectiveAsOf: string;
  terRates: TerRateRow[];
  ptkpRates: Record<string, PtkpRateRow>;
  progressiveBrackets: ProgressiveBracket[];
  biayaJabatan: { pct: number; maxPerMonth: Rupiah };
  bpjs: BpjsRateSet;
  overtimeRules: OvertimeRuleRow[];
}

export interface CompanyPolicy {
  riskClassJkk: string;
  prorataMethod: ProrataMethod;
  roundingMode: RoundingMode;
  minimumWage: Rupiah;
  maxDeductionPct: number; // misal 0.5 = 50%
}

export interface PayrollInput {
  period: {
    startDate: string;
    endDate: string;
    isFinalTaxPeriod: boolean;
  };
  employee: {
    ptkpStatus: string;
    workPattern: WorkPattern;
    salarySegments: SalarySegment[];
    variableAllowances: VariableAllowanceInput[];
    overtimeEligible: boolean;
    bpjsExtraFamilyMembers: number;
  };
  attendance: AttendanceSummary;
  overtime: OvertimeInput[];
  irregularIncome: IrregularIncomeInput[];
  deductions: DeductionInput[];
  ytd?: TaxYtd;
  rates: RateSet;
  policy: CompanyPolicy;
}

export type PayrollComponentKind = 'earning' | 'deduction' | 'company_contribution' | 'taxable_benefit';

export interface PayrollComponentLine {
  type: PayrollComponentKind;
  code: string;
  name: string;
  amount: Rupiah;
  referenceId?: string;
}

export interface PayrollResult {
  baseSalary: Rupiah;
  fixedAllowanceTotal: Rupiah;
  variableAllowanceTotal: Rupiah;
  overtimeAmount: Rupiah;
  irregularIncomeTotal: Rupiah;
  bpjsWageBase: Rupiah;
  bpjsKesEmployee: Rupiah;
  bpjsKesCompany: Rupiah;
  jhtEmployee: Rupiah;
  jhtCompany: Rupiah;
  jkkCompany: Rupiah;
  jkmCompany: Rupiah;
  jpEmployee: Rupiah;
  jpCompany: Rupiah;
  pph21Gross: Rupiah;
  pph21Method: 'ter' | 'annual_reconciliation';
  pph21Amount: Rupiah;
  pph21Refund: Rupiah;
  otherDeductionsTotal: Rupiah;
  deferredDeductionIds: string[];
  netSalary: Rupiah;
  totalCompanyContribution: Rupiah;
  components: PayrollComponentLine[];
}
