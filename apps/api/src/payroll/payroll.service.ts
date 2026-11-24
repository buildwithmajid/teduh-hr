import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PayrollRunType, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuditContext, AuthUser } from '../common/auth-context';
import { CryptoContext, FieldCrypto } from '../common/crypto/field-crypto';
import { formatDateOnly, parseDateOnly, todayIn } from '../common/dates';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { calculateEmployeePayroll } from './engine/payroll-orchestrator';
import { calculateThr } from './engine/calculators/thr.utils';
import { RateRepository } from './rates/rate.repository';

export interface SimulatePayrollInput {
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  isFinalTaxPeriod?: boolean;
  presentDays?: number;
  periodTotalDays?: number;
  absentDays?: number;
  unpaidLeaveDays?: number;
  irregularBonus?: number;
}

export interface CreatePayrollPeriodInput {
  year: number;
  month: number;
  runType?: PayrollRunType;
  attendanceStart: string;
  attendanceEnd: string;
  payDate: string;
  isFinalTaxPeriod?: boolean;
}

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: FieldCrypto,
    private readonly rateRepo: RateRepository,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  getRates(companyId: string, asOf = todayIn()) {
    return this.rateRepo.loadRateSet(asOf, companyId);
  }

  // ───────────── Period List & Create/Run Batch ─────────────

  async listPeriods(companyId: string) {
    const periods = await this.prisma.payrollPeriod.findMany({
      where: { companyId },
      include: { _count: { select: { details: true } } },
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { runSequence: 'desc' }],
    });
    return periods.map((p) => ({
      ...p,
      attendanceStart: formatDateOnly(p.attendanceStart),
      attendanceEnd: formatDateOnly(p.attendanceEnd),
      payDate: formatDateOnly(p.payDate),
      employeeCount: p._count.details,
    }));
  }

  async createAndRunPeriod(actor: AuthUser, ctx: AuditContext, dto: CreatePayrollPeriodInput) {
    const runType = dto.runType ?? 'regular';
    const attendanceStart = parseDateOnly(dto.attendanceStart);
    const attendanceEnd = parseDateOnly(dto.attendanceEnd);
    const payDate = parseDateOnly(dto.payDate);
    if (attendanceEnd < attendanceStart) throw new BadRequestException('Tanggal akhir periode harus >= tanggal mulai');

    const latest = await this.prisma.payrollPeriod.findFirst({
      where: { companyId: actor.companyId, year: dto.year, month: dto.month, runType },
      orderBy: { runSequence: 'desc' },
    });

    const period = await this.prisma.payrollPeriod.create({
      data: {
        companyId: actor.companyId,
        year: dto.year,
        month: dto.month,
        runType,
        runSequence: (latest?.runSequence ?? 0) + 1,
        attendanceStart,
        attendanceEnd,
        payDate,
        isFinalTaxPeriod: dto.isFinalTaxPeriod ?? dto.month === 12,
        status: 'draft',
        processedBy: actor.userId,
      },
    });

    return this.runBatchCalculation(actor, ctx, period.id);
  }

  /** Hitung ulang seluruh karyawan pada run berstatus `draft` (idempoten). */
  async runBatchCalculation(actor: AuthUser, ctx: AuditContext, periodId: string) {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: { id: periodId, companyId: actor.companyId },
    });
    if (!period) throw new NotFoundException('Periode payroll tidak ditemukan');
    if (period.status !== 'draft') {
      throw new ConflictException('Hanya periode berstatus draft yang dapat dihitung ulang');
    }

    const startStr = formatDateOnly(period.attendanceStart);
    const endStr = formatDateOnly(period.attendanceEnd);

    // Muat tarif regulasi SEKALI per run
    const [settings, rates, employees, ytdRows] = await Promise.all([
      this.prisma.companySettings.findUniqueOrThrow({ where: { companyId: actor.companyId } }),
      this.rateRepo.loadRateSet(endStr, actor.companyId),
      this.prisma.employee.findMany({
        where: { companyId: actor.companyId, employmentStatus: 'active', joinDate: { lte: period.attendanceEnd } },
        include: {
          position: { select: { overtimeEligible: true } },
          salaryComponents: {
            where: {
              effectiveFrom: { lte: period.attendanceEnd },
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: period.attendanceStart } }],
            },
            include: { component: true },
          },
          overtimeEntries: {
            where: {
              status: 'approved',
              workDate: { gte: period.attendanceStart, lte: period.attendanceEnd },
            },
          },
          attendances: {
            where: { workDate: { gte: period.attendanceStart, lte: period.attendanceEnd } },
          },
          reimbursements: {
            where: { status: 'approved', paidPayrollPeriodId: null },
          },
        },
        orderBy: { employeeCode: 'asc' },
      }),
      this.prisma.taxYearSummary.findMany({
        where: { companyId: actor.companyId, year: period.year },
      }),
    ]);

    const ytdMap = new Map(ytdRows.map((y) => [y.employeeId, y]));
    const periodTotalDays = 21; // standar hari kerja bulanan (untuk periode penuh)

    const computed = employees.map((emp) => {
      const baseSalary = this.crypto.decryptAmount(emp.baseSalaryEncrypted, CryptoContext.baseSalary);
      const fixedAllowances: { code: string; name: string; amount: number; isTaxable: boolean }[] = [];
      const variableAllowances: {
        code: string;
        name: string;
        calculation: 'fixed_amount' | 'per_attendance_day';
        rateAmount: number;
        isTaxable: boolean;
      }[] = [];

      for (const sc of emp.salaryComponents) {
        if (sc.component.type !== 'earning') continue;
        const amount = this.crypto.decryptAmount(sc.amountEncrypted, CryptoContext.componentAmount);
        if (sc.component.isFixed) {
          fixedAllowances.push({ code: sc.component.code, name: sc.component.name, amount, isTaxable: sc.component.isTaxable });
        } else {
          variableAllowances.push({
            code: sc.component.code,
            name: sc.component.name,
            calculation: sc.component.calculation,
            rateAmount: amount,
            isTaxable: sc.component.isTaxable,
          });
        }
      }

      const absentDays = emp.attendances.filter((a) => a.status === 'absent').length;
      const presentDays = emp.attendances.length > 0
        ? emp.attendances.filter((a) => a.status === 'present' || a.status === 'late').length
        : periodTotalDays;

      const irregularIncome: { code: string; name: string; amount: number; isTaxable: boolean }[] = [];
      if (period.runType === 'thr') {
        const monthlyWage = baseSalary + fixedAllowances.reduce((s, f) => s + f.amount, 0);
        const thr = calculateThr(monthlyWage, emp.joinDate, period.payDate);
        if (thr.amount > 0) {
          irregularIncome.push({
            code: 'thr',
            name: thr.isProrated
              ? `Tunjangan Hari Raya (Prorata ${thr.serviceMonths}/12 bln)`
              : 'Tunjangan Hari Raya (THR)',
            amount: thr.amount,
            isTaxable: true,
          });
        }
      }
      if (period.runType === 'regular' && emp.reimbursements.length > 0) {
        for (const reimb of emp.reimbursements) {
          irregularIncome.push({
            code: 'reimbursement',
            name: `Reimbursement: ${reimb.title}`,
            amount: Number(reimb.amount),
            isTaxable: false,
          });
        }
      }

      const ytd = ytdMap.get(emp.id);
      const result = calculateEmployeePayroll({
        period: { startDate: startStr, endDate: endStr, isFinalTaxPeriod: period.isFinalTaxPeriod },
        employee: {
          ptkpStatus: emp.ptkpStatus,
          workPattern: emp.workPattern ?? settings.defaultWorkPattern,
          salarySegments: [{ baseSalary, fixedAllowances, activeDays: periodTotalDays }],
          variableAllowances,
          overtimeEligible: emp.overtimeEligible ?? emp.position.overtimeEligible,
          bpjsExtraFamilyMembers: emp.bpjsExtraFamilyMembers,
        },
        attendance: { periodTotalDays, presentDays, absentDays, unpaidLeaveDays: 0 },
        overtime: emp.overtimeEntries.map((o) => ({ id: o.id, dayType: o.dayType, hours: Number(o.hours) })),
        irregularIncome,
        deductions: [],
        ytd: ytd
          ? {
              bruto: this.crypto.decryptAmount(ytd.grossYtdEncrypted, CryptoContext.payrollAmount),
              jhtEmployee: Number(ytd.jhtEmployeeYtd),
              jpEmployee: Number(ytd.jpEmployeeYtd),
              pph21Paid: this.crypto.decryptAmount(ytd.pph21YtdEncrypted, CryptoContext.payrollAmount),
              monthsWorkedIncludingCurrent: ytd.monthsWorked + 1,
            }
          : { bruto: 0, jhtEmployee: 0, jpEmployee: 0, pph21Paid: 0, monthsWorkedIncludingCurrent: period.month },
        rates,
        policy: {
          riskClassJkk: settings.riskClassJkk,
          prorataMethod: settings.prorataMethod,
          roundingMode: settings.roundingMode,
          minimumWage: Number(settings.minimumWage),
          maxDeductionPct: Number(settings.maxDeductionPct),
        },
      });

      return { emp, result };
    });

    const enc = (n: number) => this.crypto.encryptAmount(n, CryptoContext.payrollAmount);

    await this.prisma.$transaction(async (tx) => {
      await tx.payrollDetail.deleteMany({ where: { payrollPeriodId: period.id } });
      await tx.payrollPeriod.update({
        where: { id: period.id },
        data: { processedBy: actor.userId, rejectionNotes: null },
      });

      for (const { emp, result } of computed) {
        await tx.payrollDetail.create({
          data: {
            payrollPeriodId: period.id,
            employeeId: emp.id,
            baseSalaryEncrypted: enc(result.baseSalary),
            fixedAllowanceEncrypted: enc(result.fixedAllowanceTotal),
            variableAllowanceEncrypted: enc(result.variableAllowanceTotal),
            overtimeAmountEncrypted: enc(result.overtimeAmount),
            irregularIncomeEncrypted: enc(result.irregularIncomeTotal),
            bpjsWageBase: new Prisma.Decimal(result.bpjsWageBase),
            bpjsKesEmployee: new Prisma.Decimal(result.bpjsKesEmployee),
            bpjsKesCompany: new Prisma.Decimal(result.bpjsKesCompany),
            jhtEmployee: new Prisma.Decimal(result.jhtEmployee),
            jhtCompany: new Prisma.Decimal(result.jhtCompany),
            jkkCompany: new Prisma.Decimal(result.jkkCompany),
            jkmCompany: new Prisma.Decimal(result.jkmCompany),
            jpEmployee: new Prisma.Decimal(result.jpEmployee),
            jpCompany: new Prisma.Decimal(result.jpCompany),
            pph21GrossEncrypted: enc(result.pph21Gross),
            pph21Method: result.pph21Method,
            pph21AmountEncrypted: enc(result.pph21Amount),
            pph21RefundEncrypted: enc(result.pph21Refund),
            isFinalTaxPeriod: period.isFinalTaxPeriod,
            otherDeductionsEncrypted: enc(result.otherDeductionsTotal),
            netSalaryEncrypted: enc(result.netSalary),
            rateSnapshot: { effectiveAsOf: rates.effectiveAsOf, riskClassJkk: settings.riskClassJkk } as Prisma.InputJsonValue,
            components: {
              create: result.components.map((c) => ({
                componentType: c.type,
                componentCode: c.code,
                componentName: c.name,
                amountEncrypted: enc(c.amount),
                referenceId: c.referenceId ?? null,
              })),
            },
          },
        });
      }

      await this.audit.record(tx, ctx, {
        tableName: 'payroll_periods',
        recordId: period.id,
        action: 'update',
        newValue: { calculatedEmployees: computed.length, status: 'draft' },
      });
    });

    return { id: period.id, employeeCount: computed.length, status: 'draft' };
  }

  // ───────────── Period Detail + Laporan Biaya per Departemen ─────────────

  async getPeriodDetail(actor: AuthUser, ctx: AuditContext, periodId: string) {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: { id: periodId, companyId: actor.companyId },
      include: {
        details: {
          include: {
            employee: {
              select: {
                id: true,
                employeeCode: true,
                fullName: true,
                ptkpStatus: true,
                department: { select: { id: true, name: true } },
                position: { select: { title: true } },
              },
            },
          },
          orderBy: { employee: { employeeCode: 'asc' } },
        },
      },
    });
    if (!period) throw new NotFoundException('Periode payroll tidak ditemukan');

    await this.audit.recordStandalone(ctx, {
      tableName: 'payroll_periods',
      recordId: period.id,
      action: 'view_sensitive',
    });

    const dec = (s: string) => this.crypto.decryptAmount(s, CryptoContext.payrollAmount);
    const deptMap = new Map<
      string,
      {
        departmentId: string;
        departmentName: string;
        employeeCount: number;
        grossCash: number;
        bpjsCompany: number;
        bpjsEmployee: number;
        pph21: number;
        netSalary: number;
        totalCompanyCost: number;
      }
    >();

    const totals = {
      employeeCount: period.details.length,
      grossCash: 0,
      bpjsCompany: 0,
      bpjsEmployee: 0,
      pph21: 0,
      pph21Refund: 0,
      netSalary: 0,
      totalCompanyCost: 0,
    };

    const items = period.details.map((d) => {
      const baseSalary = dec(d.baseSalaryEncrypted);
      const fixedAllowance = dec(d.fixedAllowanceEncrypted);
      const variableAllowance = dec(d.variableAllowanceEncrypted);
      const overtimeAmount = dec(d.overtimeAmountEncrypted);
      const irregularIncome = dec(d.irregularIncomeEncrypted);
      const pph21Gross = dec(d.pph21GrossEncrypted);
      const pph21Amount = dec(d.pph21AmountEncrypted);
      const pph21Refund = dec(d.pph21RefundEncrypted);
      const otherDeductions = dec(d.otherDeductionsEncrypted);
      const netSalary = dec(d.netSalaryEncrypted);

      const bpjsEmployee = Number(d.bpjsKesEmployee) + Number(d.jhtEmployee) + Number(d.jpEmployee);
      const bpjsCompany =
        Number(d.bpjsKesCompany) + Number(d.jhtCompany) + Number(d.jkkCompany) + Number(d.jkmCompany) + Number(d.jpCompany);
      const grossCash = baseSalary + fixedAllowance + variableAllowance + overtimeAmount + irregularIncome;
      const totalCompanyCost = grossCash + bpjsCompany;

      totals.grossCash += grossCash;
      totals.bpjsCompany += bpjsCompany;
      totals.bpjsEmployee += bpjsEmployee;
      totals.pph21 += pph21Amount;
      totals.pph21Refund += pph21Refund;
      totals.netSalary += netSalary;
      totals.totalCompanyCost += totalCompanyCost;

      const dept = d.employee.department;
      const acc = deptMap.get(dept.id) ?? {
        departmentId: dept.id,
        departmentName: dept.name,
        employeeCount: 0,
        grossCash: 0,
        bpjsCompany: 0,
        bpjsEmployee: 0,
        pph21: 0,
        netSalary: 0,
        totalCompanyCost: 0,
      };
      acc.employeeCount += 1;
      acc.grossCash += grossCash;
      acc.bpjsCompany += bpjsCompany;
      acc.bpjsEmployee += bpjsEmployee;
      acc.pph21 += pph21Amount;
      acc.netSalary += netSalary;
      acc.totalCompanyCost += totalCompanyCost;
      deptMap.set(dept.id, acc);

      return {
        id: d.id,
        employee: d.employee,
        baseSalary,
        fixedAllowance,
        variableAllowance,
        overtimeAmount,
        irregularIncome,
        grossCash,
        bpjsEmployee,
        bpjsCompany,
        pph21Gross,
        pph21Method: d.pph21Method,
        pph21Amount,
        pph21Refund,
        otherDeductions,
        netSalary,
        totalCompanyCost,
      };
    });

    return {
      period: {
        id: period.id,
        year: period.year,
        month: period.month,
        runType: period.runType,
        runSequence: period.runSequence,
        attendanceStart: formatDateOnly(period.attendanceStart),
        attendanceEnd: formatDateOnly(period.attendanceEnd),
        payDate: formatDateOnly(period.payDate),
        isFinalTaxPeriod: period.isFinalTaxPeriod,
        status: period.status,
        processedBy: period.processedBy,
        approvedBy: period.approvedBy,
        rejectionNotes: period.rejectionNotes,
        lockedAt: period.lockedAt,
      },
      totals,
      departmentReport: [...deptMap.values()].sort((a, b) => b.totalCompanyCost - a.totalCompanyCost),
      items,
    };
  }

  // ───────────── Workflow Approval & Lock (Separation of Duties) ─────────────

  async submitForApproval(actor: AuthUser, ctx: AuditContext, periodId: string) {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: { id: periodId, companyId: actor.companyId },
      include: { _count: { select: { details: true } } },
    });
    if (!period) throw new NotFoundException('Periode payroll tidak ditemukan');
    if (period.status !== 'draft') throw new ConflictException('Hanya periode draft yang bisa diajukan');
    if (period._count.details === 0) throw new BadRequestException('Periode payroll belum memiliki data karyawan');

    const financeUsers = await this.prisma.userRole.findMany({
      where: { companyId: actor.companyId, role: { name: 'finance' }, user: { isActive: true } },
      select: { userId: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.payrollPeriod.update({
        where: { id: periodId },
        data: { status: 'pending_approval', processedBy: actor.userId, rejectionNotes: null },
      });
      await this.audit.record(tx, ctx, {
        tableName: 'payroll_periods',
        recordId: periodId,
        action: 'update',
        oldValue: { status: period.status },
        newValue: { status: 'pending_approval' },
      });
      await this.notifications.createMany(
        tx,
        financeUsers
          .filter((f) => f.userId !== actor.userId)
          .map((f) => ({
            userId: f.userId,
            type: 'payroll_approval_needed',
            title: 'Verifikasi payroll diperlukan',
            message: `Run payroll ${period.month}/${period.year} (${period.runType}) menunggu verifikasi & persetujuan Finance.`,
            linkUrl: `/payroll/${period.id}`,
          })),
      );
      return updated;
    });
  }

  async approveAndLock(actor: AuthUser, ctx: AuditContext, periodId: string) {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: { id: periodId, companyId: actor.companyId },
      include: {
        details: { include: { employee: { select: { id: true, userId: true, ptkpStatus: true } } } },
      },
    });
    if (!period) throw new NotFoundException('Periode payroll tidak ditemukan');
    if (period.status !== 'pending_approval') {
      throw new ConflictException('Hanya periode yang menunggu persetujuan yang bisa dikunci');
    }
    if (period.processedBy === actor.userId) {
      throw new ForbiddenException('Pemroses payroll tidak boleh menyetujui run sendiri (separation of duties)');
    }

    const dec = (s: string) => this.crypto.decryptAmount(s, CryptoContext.payrollAmount);
    const enc = (n: number) => this.crypto.encryptAmount(n, CryptoContext.payrollAmount);

    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.payrollPeriod.update({
        where: { id: periodId },
        data: { status: 'locked', approvedBy: actor.userId, lockedAt: new Date() },
      });

      // Akumulasi TaxYearSummary YTD per karyawan
      for (const d of period.details) {
        const gross = dec(d.pph21GrossEncrypted);
        const tax = dec(d.pph21AmountEncrypted);
        const existing = await tx.taxYearSummary.findUnique({
          where: { employeeId_companyId_year: { employeeId: d.employeeId, companyId: actor.companyId, year: period.year } },
        });
        if (existing) {
          const prevGross = dec(existing.grossYtdEncrypted);
          const prevTax = dec(existing.pph21YtdEncrypted);
          await tx.taxYearSummary.update({
            where: { id: existing.id },
            data: {
              monthsWorked: existing.monthsWorked + (period.runType === 'regular' ? 1 : 0),
              grossYtdEncrypted: enc(prevGross + gross),
              jhtEmployeeYtd: { increment: d.jhtEmployee },
              jpEmployeeYtd: { increment: d.jpEmployee },
              pph21YtdEncrypted: enc(prevTax + tax),
            },
          });
        } else {
          await tx.taxYearSummary.create({
            data: {
              employeeId: d.employeeId,
              companyId: actor.companyId,
              year: period.year,
              ptkpStatus: d.employee.ptkpStatus,
              monthsWorked: period.runType === 'regular' ? 1 : 0,
              grossYtdEncrypted: enc(gross),
              jhtEmployeeYtd: d.jhtEmployee,
              jpEmployeeYtd: d.jpEmployee,
              pph21YtdEncrypted: enc(tax),
            },
          });
        }
      }

      if (period.runType === 'regular' && period.details.length > 0) {
        await tx.reimbursement.updateMany({
          where: {
            companyId: actor.companyId,
            employeeId: { in: period.details.map((d) => d.employeeId) },
            status: 'approved',
            paidPayrollPeriodId: null,
          },
          data: { paidPayrollPeriodId: periodId },
        });
      }

      await this.audit.record(tx, ctx, {
        tableName: 'payroll_periods',
        recordId: periodId,
        action: 'update',
        oldValue: { status: 'pending_approval' },
        newValue: { status: 'locked', approvedBy: actor.userId },
      });

      // Notifikasi slip gaji tersedia ke semua karyawan terkait
      const userIds = period.details.map((d) => d.employee.userId).filter((id): id is string => Boolean(id));
      await this.notifications.createMany(
        tx,
        userIds.map((userId) => ({
          userId,
          type: 'payslip_ready',
          title: `Slip gaji ${period.month}/${period.year} tersedia`,
          message: 'Payroll telah disetujui dan slip gaji digital Anda sudah dapat dilihat atau dicetak.',
          linkUrl: '/payslips',
        })),
      );

      return locked;
    });
  }

  async rejectToDraft(actor: AuthUser, ctx: AuditContext, periodId: string, notes: string) {
    const period = await this.prisma.payrollPeriod.findFirst({ where: { id: periodId, companyId: actor.companyId } });
    if (!period) throw new NotFoundException('Periode payroll tidak ditemukan');
    if (period.status !== 'pending_approval') throw new ConflictException('Hanya periode pending_approval yang bisa ditolak');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.payrollPeriod.update({
        where: { id: periodId },
        data: { status: 'draft', rejectionNotes: notes.trim() },
      });
      await this.audit.record(tx, ctx, {
        tableName: 'payroll_periods',
        recordId: periodId,
        action: 'update',
        oldValue: { status: 'pending_approval' },
        newValue: { status: 'draft', rejectionNotes: notes.trim() },
      });
      if (period.processedBy) {
        await this.notifications.create(tx, {
          userId: period.processedBy,
          type: 'payroll_rejected',
          title: `Payroll ${period.month}/${period.year} dikembalikan ke draft`,
          message: `Catatan Finance: ${notes.trim()}`,
          linkUrl: `/payroll/${period.id}`,
        });
      }
      return updated;
    });
  }

  // ───────────── Slip Gaji Digital ─────────────

  async listMyPayslips(user: AuthUser) {
    if (!user.employeeId) return [];
    const rows = await this.prisma.payrollDetail.findMany({
      where: { employeeId: user.employeeId, period: { status: 'locked' } },
      include: { period: true },
      orderBy: [{ period: { year: 'desc' } }, { period: { month: 'desc' } }, { period: { runSequence: 'desc' } }],
    });
    const dec = (s: string) => this.crypto.decryptAmount(s, CryptoContext.payrollAmount);
    return rows.map((d) => ({
      id: d.id,
      periodId: d.payrollPeriodId,
      year: d.period.year,
      month: d.period.month,
      runType: d.period.runType,
      payDate: formatDateOnly(d.period.payDate),
      netSalary: dec(d.netSalaryEncrypted),
      pph21Amount: dec(d.pph21AmountEncrypted),
    }));
  }

  async getPayslip(user: AuthUser, ctx: AuditContext, detailId: string) {
    const detail = await this.prisma.payrollDetail.findFirst({
      where: { id: detailId, period: { companyId: user.companyId } },
      include: {
        period: { include: { company: true } },
        employee: {
          include: {
            department: { select: { name: true } },
            position: { select: { title: true } },
          },
        },
        components: true,
      },
    });
    if (!detail) throw new NotFoundException('Slip gaji tidak ditemukan');

    const isOwner = detail.employeeId === user.employeeId;
    const canViewAny = user.permissions.includes('payroll.view');
    if (!isOwner && !canViewAny) throw new ForbiddenException('Tidak punya akses ke slip gaji ini');
    if (isOwner && !canViewAny && detail.period.status !== 'locked') {
      throw new ForbiddenException('Slip gaji baru tersedia setelah payroll dikunci');
    }

    if (!isOwner) {
      await this.audit.recordStandalone(ctx, {
        tableName: 'payroll_details',
        recordId: detail.id,
        action: 'view_sensitive',
      });
    }

    const dec = (s: string) => this.crypto.decryptAmount(s, CryptoContext.payrollAmount);
    const comps = detail.components.map((c) => ({
      type: c.componentType,
      code: c.componentCode,
      name: c.componentName,
      amount: dec(c.amountEncrypted),
    }));

    return {
      id: detail.id,
      company: {
        name: detail.period.company.name,
        npwp: detail.period.company.npwp,
        address: detail.period.company.address,
      },
      period: {
        year: detail.period.year,
        month: detail.period.month,
        runType: detail.period.runType,
        attendanceStart: formatDateOnly(detail.period.attendanceStart),
        attendanceEnd: formatDateOnly(detail.period.attendanceEnd),
        payDate: formatDateOnly(detail.period.payDate),
        status: detail.period.status,
      },
      employee: {
        employeeCode: detail.employee.employeeCode,
        fullName: detail.employee.fullName,
        department: detail.employee.department.name,
        position: detail.employee.position.title,
        ptkpStatus: detail.employee.ptkpStatus,
        bankName: detail.employee.bankName,
      },
      earnings: comps.filter((c) => c.type === 'earning'),
      deductions: comps.filter((c) => c.type === 'deduction'),
      companyContributions: comps.filter((c) => c.type === 'company_contribution' || c.type === 'taxable_benefit'),
      summary: {
        baseSalary: dec(detail.baseSalaryEncrypted),
        pph21Gross: dec(detail.pph21GrossEncrypted),
        pph21Method: detail.pph21Method,
        pph21Amount: dec(detail.pph21AmountEncrypted),
        pph21Refund: dec(detail.pph21RefundEncrypted),
        netSalary: dec(detail.netSalaryEncrypted),
      },
    };
  }

  // ───────────── Simulasi 1 Karyawan (Fase 3) ─────────────

  async simulateForEmployee(user: AuthUser, dto: SimulatePayrollInput) {
    const [emp, settings, rates] = await Promise.all([
      this.prisma.employee.findFirst({
        where: { id: dto.employeeId, companyId: user.companyId },
        include: {
          position: { select: { overtimeEligible: true } },
          salaryComponents: {
            where: {
              effectiveFrom: { lte: parseDateOnly(dto.periodEnd) },
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: parseDateOnly(dto.periodStart) } }],
            },
            include: { component: true },
          },
          overtimeEntries: {
            where: {
              status: 'approved',
              workDate: { gte: parseDateOnly(dto.periodStart), lte: parseDateOnly(dto.periodEnd) },
            },
          },
        },
      }),
      this.prisma.companySettings.findUniqueOrThrow({ where: { companyId: user.companyId } }),
      this.rateRepo.loadRateSet(dto.periodEnd, user.companyId),
    ]);

    if (!emp) throw new NotFoundException('Karyawan tidak ditemukan');

    const baseSalary = this.crypto.decryptAmount(emp.baseSalaryEncrypted, CryptoContext.baseSalary);
    const fixedAllowances: { code: string; name: string; amount: number; isTaxable: boolean }[] = [];
    const variableAllowances: {
      code: string;
      name: string;
      calculation: 'fixed_amount' | 'per_attendance_day';
      rateAmount: number;
      isTaxable: boolean;
    }[] = [];

    for (const sc of emp.salaryComponents) {
      if (sc.component.type !== 'earning') continue;
      const amount = this.crypto.decryptAmount(sc.amountEncrypted, CryptoContext.componentAmount);
      if (sc.component.isFixed) {
        fixedAllowances.push({ code: sc.component.code, name: sc.component.name, amount, isTaxable: sc.component.isTaxable });
      } else {
        variableAllowances.push({
          code: sc.component.code,
          name: sc.component.name,
          calculation: sc.component.calculation,
          rateAmount: amount,
          isTaxable: sc.component.isTaxable,
        });
      }
    }

    const periodTotalDays = dto.periodTotalDays ?? 21;
    const presentDays = dto.presentDays ?? periodTotalDays;

    const result = calculateEmployeePayroll({
      period: { startDate: dto.periodStart, endDate: dto.periodEnd, isFinalTaxPeriod: dto.isFinalTaxPeriod ?? false },
      employee: {
        ptkpStatus: emp.ptkpStatus,
        workPattern: emp.workPattern ?? settings.defaultWorkPattern,
        salarySegments: [{ baseSalary, fixedAllowances, activeDays: periodTotalDays }],
        variableAllowances,
        overtimeEligible: emp.overtimeEligible ?? emp.position.overtimeEligible,
        bpjsExtraFamilyMembers: emp.bpjsExtraFamilyMembers,
      },
      attendance: {
        periodTotalDays,
        presentDays,
        absentDays: dto.absentDays ?? 0,
        unpaidLeaveDays: dto.unpaidLeaveDays ?? 0,
      },
      overtime: emp.overtimeEntries.map((o) => ({ id: o.id, dayType: o.dayType, hours: Number(o.hours) })),
      irregularIncome:
        dto.irregularBonus && dto.irregularBonus > 0
          ? [{ code: 'irregular_bonus', name: 'THR / Bonus', amount: dto.irregularBonus, isTaxable: true }]
          : [],
      deductions: [],
      rates,
      policy: {
        riskClassJkk: settings.riskClassJkk,
        prorataMethod: settings.prorataMethod,
        roundingMode: settings.roundingMode,
        minimumWage: Number(settings.minimumWage),
        maxDeductionPct: Number(settings.maxDeductionPct),
      },
    });

    return {
      employee: { id: emp.id, employeeCode: emp.employeeCode, fullName: emp.fullName, ptkpStatus: emp.ptkpStatus },
      period: { startDate: dto.periodStart, endDate: dto.periodEnd, isFinalTaxPeriod: dto.isFinalTaxPeriod ?? false },
      result,
    };
  }

  async getAnalytics(companyId: string) {
    const periods = await this.prisma.payrollPeriod.findMany({
      where: { companyId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { runSequence: 'desc' }],
      take: 6,
      include: {
        details: {
          select: {
            baseSalaryEncrypted: true,
            fixedAllowanceEncrypted: true,
            variableAllowanceEncrypted: true,
            overtimeAmountEncrypted: true,
            irregularIncomeEncrypted: true,
            bpjsKesCompany: true,
            jhtCompany: true,
            jkkCompany: true,
            jkmCompany: true,
            jpCompany: true,
            pph21AmountEncrypted: true,
            netSalaryEncrypted: true,
          },
        },
      },
    });

    const dec = (s: string) => this.crypto.decryptAmount(s, CryptoContext.payrollAmount);

    const series = periods
      .map((p) => {
        let netSalary = 0;
        let pph21 = 0;
        let bpjsCompany = 0;
        let totalCompanyCost = 0;

        for (const d of p.details) {
          const grossCash =
            dec(d.baseSalaryEncrypted) +
            dec(d.fixedAllowanceEncrypted) +
            dec(d.variableAllowanceEncrypted) +
            dec(d.overtimeAmountEncrypted) +
            dec(d.irregularIncomeEncrypted);
          const bpjsC =
            Number(d.bpjsKesCompany) +
            Number(d.jhtCompany) +
            Number(d.jkkCompany) +
            Number(d.jkmCompany) +
            Number(d.jpCompany);
          netSalary += dec(d.netSalaryEncrypted);
          pph21 += dec(d.pph21AmountEncrypted);
          bpjsCompany += bpjsC;
          totalCompanyCost += grossCash + bpjsC;
        }

        return {
          id: p.id,
          year: p.year,
          month: p.month,
          runType: p.runType,
          status: p.status,
          payDate: formatDateOnly(p.payDate),
          employeeCount: p.details.length,
          netSalary,
          pph21,
          bpjsCompany,
          totalCompanyCost,
        };
      })
      .reverse();

    const [draftCount, pendingApprovalCount, lockedCount] = await Promise.all([
      this.prisma.payrollPeriod.count({ where: { companyId, status: 'draft' } }),
      this.prisma.payrollPeriod.count({ where: { companyId, status: 'pending_approval' } }),
      this.prisma.payrollPeriod.count({ where: { companyId, status: 'locked' } }),
    ]);

    return {
      counts: { draft: draftCount, pendingApproval: pendingApprovalCount, locked: lockedCount },
      latest: series.length > 0 ? series[series.length - 1] : null,
      series,
    };
  }

  async exportPeriodCsv(
    actor: AuthUser,
    ctx: AuditContext,
    periodId: string,
    type: 'bank' | 'bpjs' | 'pph21',
  ): Promise<{ filename: string; csv: string }> {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: { id: periodId, companyId: actor.companyId },
      include: {
        details: {
          include: {
            employee: {
              select: {
                employeeCode: true,
                fullName: true,
                ptkpStatus: true,
                bankName: true,
                bankAccountEncrypted: true,
                npwpEncrypted: true,
                bpjsKesehatanNumber: true,
                bpjsTkNumber: true,
                department: { select: { name: true } },
              },
            },
          },
          orderBy: { employee: { employeeCode: 'asc' } },
        },
      },
    });
    if (!period) throw new NotFoundException('Periode payroll tidak ditemukan');

    if (type === 'bank' || type === 'pph21') {
      await this.audit.record(this.prisma, ctx, {
        tableName: 'payroll_periods',
        recordId: period.id,
        action: 'view_sensitive',
        newValue: { exportType: type },
      });
    }

    const decPay = (s: string) => this.crypto.decryptAmount(s, CryptoContext.payrollAmount);
    const esc = (v: string | number | null | undefined) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const tag = `${period.year}-${String(period.month).padStart(2, '0')}-${period.runType}`;

    if (type === 'bank') {
      const header = ['Kode Karyawan', 'Nama', 'Departemen', 'Bank', 'No Rekening', 'Take-Home Pay (IDR)', 'Keterangan'];
      const rows = period.details.map((d) => {
        const acct = d.employee.bankAccountEncrypted
          ? this.crypto.decrypt(d.employee.bankAccountEncrypted, CryptoContext.bankAccount)
          : '';
        return [
          d.employee.employeeCode,
          d.employee.fullName,
          d.employee.department.name,
          d.employee.bankName ?? '',
          acct,
          decPay(d.netSalaryEncrypted),
          `Payroll ${period.month}/${period.year} (${period.runType})`,
        ];
      });
      return {
        filename: `transfer-bank-${tag}.csv`,
        csv: [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n'),
      };
    }

    if (type === 'bpjs') {
      const header = [
        'Kode Karyawan',
        'Nama',
        'No BPJS Kesehatan',
        'No BPJS TK',
        'Upah Dasar BPJS',
        'Kes Karyawan',
        'Kes Perusahaan',
        'JHT Karyawan',
        'JHT Perusahaan',
        'JKK Perusahaan',
        'JKM Perusahaan',
        'JP Karyawan',
        'JP Perusahaan',
      ];
      const rows = period.details.map((d) => [
        d.employee.employeeCode,
        d.employee.fullName,
        d.employee.bpjsKesehatanNumber ?? '',
        d.employee.bpjsTkNumber ?? '',
        Number(d.bpjsWageBase),
        Number(d.bpjsKesEmployee),
        Number(d.bpjsKesCompany),
        Number(d.jhtEmployee),
        Number(d.jhtCompany),
        Number(d.jkkCompany),
        Number(d.jkmCompany),
        Number(d.jpEmployee),
        Number(d.jpCompany),
      ]);
      return {
        filename: `rekap-bpjs-${tag}.csv`,
        csv: [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n'),
      };
    }

    const header = ['Kode Karyawan', 'Nama', 'NPWP', 'PTKP', 'Metode', 'Bruto PPh 21 (IDR)', 'PPh 21 Dipotong (IDR)', 'Lebih Bayar (IDR)'];
    const rows = period.details.map((d) => {
      const npwp = d.employee.npwpEncrypted
        ? this.crypto.decrypt(d.employee.npwpEncrypted, CryptoContext.npwp)
        : '';
      return [
        d.employee.employeeCode,
        d.employee.fullName,
        npwp,
        d.employee.ptkpStatus,
        d.pph21Method,
        decPay(d.pph21GrossEncrypted),
        decPay(d.pph21AmountEncrypted),
        decPay(d.pph21RefundEncrypted),
      ];
    });
    return {
      filename: `rekap-pph21-${tag}.csv`,
      csv: [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n'),
    };
  }
}
