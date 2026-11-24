import { calculateEmployeePayroll } from './payroll-orchestrator';
import { NegativeTakeHomePayError, PayrollInput, RateNotFoundError } from './types';
import { INDONESIA_2024_RATE_SET } from '../rates/seeds/indonesia-2024';

function baseInput(overrides: Partial<PayrollInput> = {}): PayrollInput {
  return {
    period: { startDate: '2026-11-01', endDate: '2026-11-30', isFinalTaxPeriod: false },
    employee: {
      ptkpStatus: 'K/0',
      workPattern: 'FIVE_DAY',
      salarySegments: [
        {
          baseSalary: 8_000_000,
          fixedAllowances: [{ code: 'tunjangan_jabatan', name: 'Tunjangan Jabatan', amount: 500_000, isTaxable: true }],
          activeDays: 21,
        },
      ],
      variableAllowances: [],
      overtimeEligible: true,
      bpjsExtraFamilyMembers: 0,
    },
    attendance: { periodTotalDays: 21, presentDays: 21, absentDays: 0, unpaidLeaveDays: 0 },
    overtime: [],
    irregularIncome: [],
    deductions: [],
    rates: INDONESIA_2024_RATE_SET,
    policy: {
      riskClassJkk: 'I',
      prorataMethod: 'working_days',
      roundingMode: 'round_half_up',
      minimumWage: 5_396_761,
      maxDeductionPct: 0.5,
    },
    ...overrides,
  };
}

describe('Payroll Calculation Engine — Golden Tests (PP 58/2023, PP 35/2021, PP 36/2021)', () => {
  it('End-to-end: K/0, Rp8jt + Rp500rb tunjangan tetap + 5 jam lembur hari kerja (TER A 1,75% sesuai lampiran PP 58/2023)', () => {
    const res = calculateEmployeePayroll(
      baseInput({
        overtime: [{ dayType: 'workday', hours: 5 }],
      }),
    );

    // 1. Upah tetap = 8.500.000; Lembur = (1*1.5 + 4*2) * (8.500.000/173) = 466.763
    expect(res.bpjsWageBase).toBe(8_500_000);
    expect(res.overtimeAmount).toBe(466_763);

    // 2. BPJS (dasar 8.500.000, lembur tidak masuk dasar BPJS)
    expect(res.bpjsKesCompany).toBe(340_000);
    expect(res.bpjsKesEmployee).toBe(85_000);
    expect(res.jhtCompany).toBe(314_500);
    expect(res.jhtEmployee).toBe(170_000);
    expect(res.jkkCompany).toBe(20_400);
    expect(res.jkmCompany).toBe(25_500);
    expect(res.jpCompany).toBe(170_000);
    expect(res.jpEmployee).toBe(85_000);
    expect(res.totalCompanyContribution).toBe(870_400);

    // 3. Bruto PPh 21 = 8.000.000 + 500.000 + 466.763 + 340.000 + 20.400 + 25.500 = 9.352.663
    // Lampiran PP 58/2023 TER A Rp8.550.001–Rp9.650.000 = 1,75% → 163.672
    expect(res.pph21Gross).toBe(9_352_663);
    expect(res.pph21Amount).toBe(163_672);
    expect(res.pph21Method).toBe('ter');

    // 4. Take-home pay = 8.966.763 - (85.000 + 170.000 + 85.000 + 163.672) = 8.463.091
    expect(res.netSalary).toBe(8_463_091);
  });

  it('Prorata: kenaikan gaji di tengah bulan dihitung dua segmen terpisah', () => {
    const input = baseInput();
    input.employee.salarySegments = [
      { baseSalary: 10_000_000, fixedAllowances: [], activeDays: 10 },
      { baseSalary: 12_000_000, fixedAllowances: [], activeDays: 10 },
    ];
    input.attendance.periodTotalDays = 20;
    const res = calculateEmployeePayroll(input);
    expect(res.baseSalary).toBe(11_000_000);
  });

  it('Lembur: pola 5 hari vs 6 hari di hari libur menghasilkan angka berbeda, dan hari terpendek 6 hari pakai lapisan 5 jam', () => {
    const inp5 = baseInput({ overtime: [{ dayType: 'holiday', hours: 9 }] });
    inp5.employee.workPattern = 'FIVE_DAY';
    const r5 = calculateEmployeePayroll(inp5);

    const inp6 = baseInput({ overtime: [{ dayType: 'holiday', hours: 9 }] });
    inp6.employee.workPattern = 'SIX_DAY';
    const r6 = calculateEmployeePayroll(inp6);

    const inp6Short = baseInput({ overtime: [{ dayType: 'holiday_shortest_day', hours: 9 }] });
    inp6Short.employee.workPattern = 'SIX_DAY';
    const r6Short = calculateEmployeePayroll(inp6Short);

    // 5 hari: 8*2 + 1*3 = 19x; 6 hari: 7*2 + 1*3 + 1*4 = 21x; 6 hari terpendek: 5*2 + 1*3 + 3*4 = 25x
    expect(r6.overtimeAmount).toBeGreaterThan(r5.overtimeAmount);
    expect(r6Short.overtimeAmount).toBeGreaterThan(r6.overtimeAmount);
  });

  it('BPJS: cap Rp12jt untuk Kesehatan, cap JP, floor UMK untuk upah rendah, dan kelas risiko JKK berbeda', () => {
    const high = baseInput();
    high.employee.salarySegments = [{ baseSalary: 20_000_000, fixedAllowances: [], activeDays: 21 }];
    high.policy.riskClassJkk = 'III'; // 0.89%
    const rHigh = calculateEmployeePayroll(high);
    expect(rHigh.bpjsKesEmployee).toBe(120_000); // capped 1% * 12jt
    expect(rHigh.bpjsKesCompany).toBe(480_000); // capped 4% * 12jt
    expect(rHigh.jpEmployee).toBe(100_423); // capped 1% * 10.042.300
    expect(rHigh.jkkCompany).toBe(178_000); // 0.89% * 20jt

    const low = baseInput();
    low.employee.salarySegments = [{ baseSalary: 4_000_000, fixedAllowances: [], activeDays: 21 }];
    const rLow = calculateEmployeePayroll(low);
    // Floor UMK 5.396.761 → 1% = 53.968
    expect(rLow.bpjsKesEmployee).toBe(53_968);
  });

  it('PPh 21: TER A vs B vs C dengan bruto sama menghasilkan pajak berbeda, dan status PTKP tidak dikenal melempar RateNotFoundError', () => {
    const mk = (ptkpStatus: string) => {
      const inp = baseInput();
      inp.employee.ptkpStatus = ptkpStatus;
      inp.employee.salarySegments = [{ baseSalary: 11_000_000, fixedAllowances: [], activeDays: 21 }];
      return calculateEmployeePayroll(inp);
    };
    const ra = mk('TK/0'); // TER A
    const rb = mk('K/1');  // TER B
    const rc = mk('K/3');  // TER C

    expect(ra.pph21Gross).toBe(rb.pph21Gross);
    expect(ra.pph21Amount).toBeGreaterThan(rb.pph21Amount);
    expect(rb.pph21Amount).toBeGreaterThan(rc.pph21Amount);

    expect(() => mk('INVALID')).toThrow(RateNotFoundError);
  });

  it('PPh 21: THR di bulan pembayaran menaikkan bruto & lapisan TER bulan itu', () => {
    const normal = calculateEmployeePayroll(baseInput());
    const withThr = calculateEmployeePayroll(
      baseInput({
        irregularIncome: [{ code: 'thr', name: 'THR Keagamaan', amount: 8_500_000, isTaxable: true }],
      }),
    );
    expect(withThr.pph21Gross).toBe(normal.pph21Gross + 8_500_000);
    expect(withThr.pph21Amount).toBeGreaterThan(normal.pph21Amount * 3);
  });

  it('PPh 21 Rekonsiliasi masa pajak akhir: kelebihan potong dikembalikan sebagai pph21_refund (earning)', () => {
    // Resign bulan Juni (6 bulan kerja), gaji 8jt, sudah terlalu banyak dipotong TER di Jan-Mei (misal karena THR)
    const res = calculateEmployeePayroll(
      baseInput({
        period: { startDate: '2026-06-01', endDate: '2026-06-30', isFinalTaxPeriod: true },
        ytd: {
          bruto: 45_000_000,
          jhtEmployee: 850_000,
          jpEmployee: 425_000,
          pph21Paid: 2_000_000,
          monthsWorkedIncludingCurrent: 6,
        },
      }),
    );
    expect(res.pph21Method).toBe('annual_reconciliation');
    // Total bruto ~53.88jt, biaya jabatan max 6*500k=3jt, netto < PTKP K/0 (58.5jt) → pajak setahun = 0 → refund 2.000.000
    expect(res.pph21Amount).toBe(0);
    expect(res.pph21Refund).toBe(2_000_000);
    expect(res.components.some((c) => c.code === 'pph21_refund' && c.type === 'earning' && c.amount === 2_000_000)).toBe(true);
  });

  it('Potongan PP 36/2021: cicilan melebihi batas 50% digeser (deferred), THP tetap positif', () => {
    const res = calculateEmployeePayroll(
      baseInput({
        deductions: [
          { id: 'loan-1', code: 'loan', name: 'Cicilan Pinjaman 1', amount: 3_000_000, deferrable: true },
          { id: 'loan-2', code: 'loan', name: 'Cicilan Pinjaman 2', amount: 2_500_000, deferrable: true },
        ],
      }),
    );
    // Max 50% dari 8.500.000 = 4.250.000 → loan-1 (3jt) masuk, loan-2 (2.5jt) di-defer
    expect(res.otherDeductionsTotal).toBe(3_000_000);
    expect(res.deferredDeductionIds).toEqual(['loan-2']);
    expect(res.netSalary).toBeGreaterThan(0);
  });

  it('Menolak jika potongan non-deferrable membuat take-home pay negatif', () => {
    expect(() =>
      calculateEmployeePayroll(
        baseInput({
          deductions: [{ code: 'penalty', name: 'Potongan Wajib', amount: 15_000_000, deferrable: false }],
        }),
      ),
    ).toThrow(NegativeTakeHomePayError);
  });
});
