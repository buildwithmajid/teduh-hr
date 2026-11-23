import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Gender, Prisma, RequestStatus } from '@prisma/client';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditService } from '../audit/audit.service';
import { AuditContext, AuthUser } from '../common/auth-context';
import { formatDateOnly, parseDateOnly, todayIn } from '../common/dates';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { calculateLeaveDays, serviceMonths } from './leave.utils';

export interface CreateLeaveTypeInput {
  code: string;
  name: string;
  defaultQuotaDays?: number | null;
  isPaid?: boolean;
  requiresDocument?: boolean;
  genderRestriction?: Gender | null;
  allowHalfDay?: boolean;
  minServiceMonths?: number;
  maxCarryOverDays?: number;
  carryOverExpiryMonths?: number | null;
  countsWorkingDaysOnly?: boolean;
}

export interface CreateLeaveRequestInput {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  isHalfDay?: boolean;
  reason: string;
}

export interface AdjustBalanceInput {
  employeeId: string;
  leaveTypeId: string;
  year: number;
  quotaDays: number;
  carriedOverDays?: number;
  reason: string;
}

@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly approvals: ApprovalsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ───────────── Leave Types ─────────────

  listTypes(companyId: string) {
    return this.prisma.leaveType.findMany({ where: { companyId }, orderBy: { name: 'asc' } });
  }

  async createType(companyId: string, ctx: AuditContext, dto: CreateLeaveTypeInput) {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.leaveType.create({
        data: {
          companyId,
          code: dto.code.trim().toLowerCase(),
          name: dto.name.trim(),
          defaultQuotaDays: dto.defaultQuotaDays === undefined || dto.defaultQuotaDays === null ? null : new Prisma.Decimal(dto.defaultQuotaDays),
          isPaid: dto.isPaid ?? true,
          requiresDocument: dto.requiresDocument ?? false,
          genderRestriction: dto.genderRestriction ?? null,
          allowHalfDay: dto.allowHalfDay ?? false,
          minServiceMonths: dto.minServiceMonths ?? 0,
          maxCarryOverDays: new Prisma.Decimal(dto.maxCarryOverDays ?? 0),
          carryOverExpiryMonths: dto.carryOverExpiryMonths ?? null,
          countsWorkingDaysOnly: dto.countsWorkingDaysOnly ?? true,
        },
      });
      await this.audit.record(tx, ctx, { tableName: 'leave_types', recordId: row.id, action: 'create', newValue: row });
      return row;
    });
  }

  // ───────────── Balances ─────────────

  async listMyBalances(user: AuthUser, year = new Date().getUTCFullYear()) {
    if (!user.employeeId) return [];
    const rows = await this.prisma.leaveBalance.findMany({
      where: { employeeId: user.employeeId, year },
      include: { leaveType: true },
      orderBy: { leaveType: { name: 'asc' } },
    });
    return rows.map((b) => this.formatBalance(b));
  }

  async adjustBalance(actor: AuthUser, ctx: AuditContext, dto: AdjustBalanceInput) {
    const emp = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, companyId: actor.companyId } });
    if (!emp) throw new NotFoundException('Karyawan tidak ditemukan');
    const lt = await this.prisma.leaveType.findFirst({ where: { id: dto.leaveTypeId, companyId: actor.companyId } });
    if (!lt) throw new NotFoundException('Jenis cuti tidak ditemukan');

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.leaveBalance.findUnique({
        where: { employeeId_leaveTypeId_year: { employeeId: emp.id, leaveTypeId: lt.id, year: dto.year } },
      });
      const carried = dto.carriedOverDays ?? (existing ? Number(existing.carriedOverDays) : 0);
      if (existing && Number(existing.usedDays) > dto.quotaDays + carried) {
        throw new BadRequestException('Kuota baru lebih kecil dari saldo yang sudah terpakai');
      }
      const row = existing
        ? await tx.leaveBalance.update({
            where: { id: existing.id },
            data: {
              quotaDays: new Prisma.Decimal(dto.quotaDays),
              carriedOverDays: new Prisma.Decimal(carried),
              adjustedBy: actor.userId,
              adjustmentReason: dto.reason.trim(),
              version: { increment: 1 },
            },
            include: { leaveType: true },
          })
        : await tx.leaveBalance.create({
            data: {
              employeeId: emp.id,
              leaveTypeId: lt.id,
              year: dto.year,
              quotaDays: new Prisma.Decimal(dto.quotaDays),
              carriedOverDays: new Prisma.Decimal(carried),
              adjustedBy: actor.userId,
              adjustmentReason: dto.reason.trim(),
            },
            include: { leaveType: true },
          });
      await this.audit.record(tx, ctx, {
        tableName: 'leave_balances',
        recordId: row.id,
        action: existing ? 'update' : 'create',
        oldValue: existing ?? undefined,
        newValue: row,
      });
      return this.formatBalance(row);
    });
  }

  // ───────────── Preview & Requests ─────────────

  async previewDays(user: AuthUser, leaveTypeId: string, startDate: string, endDate: string, isHalfDay = false) {
    if (!user.employeeId) throw new NotFoundException('Akun ini tidak terhubung ke data karyawan');
    const [emp, lt, settings] = await Promise.all([
      this.prisma.employee.findUniqueOrThrow({ where: { id: user.employeeId } }),
      this.prisma.leaveType.findFirst({ where: { id: leaveTypeId, companyId: user.companyId } }),
      this.prisma.companySettings.findUnique({ where: { companyId: user.companyId } }),
    ]);
    if (!lt) throw new NotFoundException('Jenis cuti tidak ditemukan');
    const holidayDates = await this.loadHolidaySet(user.companyId, startDate, endDate);
    return calculateLeaveDays({
      startDate,
      endDate,
      isHalfDay,
      countsWorkingDaysOnly: lt.countsWorkingDaysOnly,
      workPattern: emp.workPattern ?? settings?.defaultWorkPattern ?? 'FIVE_DAY',
      holidayDates,
    });
  }

  async listMyRequests(user: AuthUser) {
    if (!user.employeeId) return [];
    const rows = await this.prisma.leaveRequest.findMany({
      where: { employeeId: user.employeeId },
      include: { leaveType: { select: { id: true, code: true, name: true, isPaid: true } } },
      orderBy: { createdAt: 'desc' },
      take: 60,
    });
    return rows.map((r) => this.formatRequest(r));
  }

  async listCompanyRequests(companyId: string, status?: RequestStatus) {
    const rows = await this.prisma.leaveRequest.findMany({
      where: { employee: { companyId }, ...(status ? { status } : {}) },
      include: {
        employee: { select: { id: true, fullName: true, employeeCode: true, department: { select: { name: true } } } },
        leaveType: { select: { id: true, code: true, name: true, isPaid: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => ({ ...this.formatRequest(r), employee: r.employee }));
  }

  async createRequest(user: AuthUser, ctx: AuditContext, dto: CreateLeaveRequestInput) {
    if (!user.employeeId) throw new NotFoundException('Akun ini tidak terhubung ke data karyawan');
    const [emp, lt, settings] = await Promise.all([
      this.prisma.employee.findUniqueOrThrow({ where: { id: user.employeeId } }),
      this.prisma.leaveType.findFirst({ where: { id: dto.leaveTypeId, companyId: user.companyId, isActive: true } }),
      this.prisma.companySettings.findUnique({ where: { companyId: user.companyId } }),
    ]);
    if (emp.employmentStatus !== 'active') throw new ConflictException('Karyawan sudah tidak aktif');
    if (!lt) throw new NotFoundException('Jenis cuti tidak ditemukan atau nonaktif');

    const isHalfDay = dto.isHalfDay ?? false;
    if (isHalfDay && !lt.allowHalfDay) throw new BadRequestException(`${lt.name} tidak mengizinkan cuti setengah hari`);
    if (isHalfDay && dto.startDate !== dto.endDate) {
      throw new BadRequestException('Cuti setengah hari hanya untuk satu tanggal');
    }
    if (lt.genderRestriction && emp.gender !== lt.genderRestriction) {
      throw new BadRequestException(`${lt.name} tidak berlaku untuk jenis kelamin karyawan ini`);
    }

    const start = parseDateOnly(dto.startDate);
    const end = parseDateOnly(dto.endDate);
    if (end < start) throw new BadRequestException('Tanggal akhir harus >= tanggal mulai');

    const months = serviceMonths(emp.joinDate, start);
    if (lt.minServiceMonths > 0 && months < lt.minServiceMonths && !(lt.code === 'annual' && settings?.annualLeaveProrata)) {
      throw new BadRequestException(`${lt.name} memerlukan masa kerja minimal ${lt.minServiceMonths} bulan`);
    }

    // Cegah tumpang-tindih dengan pengajuan pending/approved lain
    const overlap = await this.prisma.leaveRequest.findFirst({
      where: {
        employeeId: emp.id,
        status: { in: ['pending', 'approved'] },
        startDate: { lte: end },
        endDate: { gte: start },
      },
    });
    if (overlap) {
      throw new ConflictException(
        `Tanggal bertabrakan dengan pengajuan cuti lain (${formatDateOnly(overlap.startDate)} – ${formatDateOnly(overlap.endDate)})`,
      );
    }

    const holidayDates = await this.loadHolidaySet(user.companyId, dto.startDate, dto.endDate);
    const calc = calculateLeaveDays({
      startDate: dto.startDate,
      endDate: dto.endDate,
      isHalfDay,
      countsWorkingDaysOnly: lt.countsWorkingDaysOnly,
      workPattern: emp.workPattern ?? settings?.defaultWorkPattern ?? 'FIVE_DAY',
      holidayDates,
    });
    if (calc.totalDays <= 0) {
      throw new BadRequestException('Rentang tanggal tidak memiliki hari kerja aktif');
    }

    // Validasi kecukupan saldo per tahun jika jenis cuti berkuota
    if (lt.defaultQuotaDays !== null) {
      for (const [yearStr, needed] of Object.entries(calc.byYear)) {
        const bal = await this.prisma.leaveBalance.findUnique({
          where: { employeeId_leaveTypeId_year: { employeeId: emp.id, leaveTypeId: lt.id, year: Number(yearStr) } },
        });
        const remaining = bal ? Number(bal.quotaDays) + Number(bal.carriedOverDays) - Number(bal.usedDays) : 0;
        if (remaining < needed) {
          throw new BadRequestException(`Saldo ${lt.name} tahun ${yearStr} tidak mencukupi (tersisa ${remaining} hari, butuh ${needed} hari)`);
        }
      }
    }

    const wf = await this.approvals.getActiveWorkflow(user.companyId, 'leave');

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.leaveRequest.create({
        data: {
          employeeId: emp.id,
          leaveTypeId: lt.id,
          workflowId: wf.id,
          startDate: start,
          endDate: end,
          isHalfDay,
          totalDays: new Prisma.Decimal(calc.totalDays),
          reason: dto.reason.trim(),
          status: 'pending',
          currentApprovalStep: 1,
        },
        include: { leaveType: { select: { id: true, code: true, name: true, isPaid: true } } },
      });
      await this.audit.record(tx, ctx, { tableName: 'leave_requests', recordId: row.id, action: 'create', newValue: row });
      await this.approvals.notifyStepApprovers(
        tx,
        user.companyId,
        emp.id,
        wf.id,
        1,
        'leave',
        'Pengajuan cuti baru',
        `${emp.fullName} mengajukan ${lt.name} (${calc.totalDays} hari: ${dto.startDate} – ${dto.endDate}).`,
      );
      return this.formatRequest(row);
    });
  }

  async decideRequest(user: AuthUser, ctx: AuditContext, id: string, decision: 'approved' | 'rejected', notes?: string) {
    const req = await this.prisma.leaveRequest.findFirst({
      where: { id, employee: { companyId: user.companyId } },
      include: { employee: true, leaveType: true },
    });
    if (!req) throw new NotFoundException('Pengajuan cuti tidak ditemukan');
    if (req.status !== 'pending') throw new ConflictException('Pengajuan cuti ini sudah diproses');

    const { step, totalSteps, onBehalfOf } = await this.approvals.assertCanAct(
      user.companyId,
      req.employeeId,
      req.workflowId,
      req.currentApprovalStep,
      'leave',
      user.userId,
    );

    const settings = await this.prisma.companySettings.findUnique({ where: { companyId: user.companyId } });
    const startStr = formatDateOnly(req.startDate);
    const endStr = formatDateOnly(req.endDate);
    const holidayDates = await this.loadHolidaySet(user.companyId, startStr, endStr);
    const calc = calculateLeaveDays({
      startDate: startStr,
      endDate: endStr,
      isHalfDay: req.isHalfDay,
      countsWorkingDaysOnly: req.leaveType.countsWorkingDaysOnly,
      workPattern: req.employee.workPattern ?? settings?.defaultWorkPattern ?? 'FIVE_DAY',
      holidayDates,
    });

    return this.prisma.$transaction(async (tx) => {
      await this.approvals.recordDecision(tx, ctx, {
        requestType: 'leave',
        requestId: req.id,
        stepId: step.id,
        approverId: user.userId,
        onBehalfOf,
        action: decision,
        notes,
      });

      if (decision === 'rejected') {
        const updated = await tx.leaveRequest.update({ where: { id }, data: { status: 'rejected' } });
        if (req.employee.userId) {
          await this.notifications.create(tx, {
            userId: req.employee.userId,
            type: 'leave_rejected',
            title: 'Pengajuan cuti ditolak',
            message: `Pengajuan ${req.leaveType.name} (${startStr} – ${endStr}) ditolak.${notes ? ` Catatan: ${notes}` : ''}`,
            linkUrl: '/leaves',
          });
        }
        return updated;
      }

      if (req.currentApprovalStep < totalSteps) {
        const nextStep = req.currentApprovalStep + 1;
        const updated = await tx.leaveRequest.update({ where: { id }, data: { currentApprovalStep: nextStep } });
        await this.approvals.notifyStepApprovers(
          tx,
          user.companyId,
          req.employeeId,
          req.workflowId,
          nextStep,
          'leave',
          'Pengajuan cuti menunggu persetujuan',
          `${req.employee.fullName} — ${req.leaveType.name} (${Number(req.totalDays)} hari) menunggu persetujuan tahap ${nextStep}.`,
        );
        return updated;
      }

      // Final approval → potong saldo per tahun dengan optimistic locking
      if (req.leaveType.defaultQuotaDays !== null) {
        for (const [yearStr, needed] of Object.entries(calc.byYear)) {
          const year = Number(yearStr);
          const bal = await tx.leaveBalance.findUnique({
            where: { employeeId_leaveTypeId_year: { employeeId: req.employeeId, leaveTypeId: req.leaveTypeId, year } },
          });
          const remaining = bal ? Number(bal.quotaDays) + Number(bal.carriedOverDays) - Number(bal.usedDays) : 0;
          if (!bal || remaining < needed) {
            throw new ConflictException(`Saldo cuti tahun ${year} tidak mencukupi saat finalisasi`);
          }
          const res = await tx.leaveBalance.updateMany({
            where: { id: bal.id, version: bal.version },
            data: { usedDays: { increment: new Prisma.Decimal(needed) }, version: { increment: 1 } },
          });
          if (res.count === 0) throw new ConflictException('Saldo cuti berubah bersamaan, silakan ulangi persetujuan');
        }
      }

      const updated = await tx.leaveRequest.update({ where: { id }, data: { status: 'approved' } });
      if (req.employee.userId) {
        await this.notifications.create(tx, {
          userId: req.employee.userId,
          type: 'leave_approved',
          title: 'Pengajuan cuti disetujui',
          message: `Pengajuan ${req.leaveType.name} (${startStr} – ${endStr}) telah disetujui.`,
          linkUrl: '/leaves',
        });
      }
      return updated;
    });
  }

  async cancelRequest(user: AuthUser, ctx: AuditContext, id: string) {
    const req = await this.prisma.leaveRequest.findFirst({
      where: { id, employeeId: user.employeeId ?? '' },
      include: { employee: true, leaveType: true },
    });
    if (!req) throw new NotFoundException('Pengajuan cuti tidak ditemukan');
    if (req.status !== 'pending' && req.status !== 'approved') {
      throw new ConflictException('Pengajuan ini tidak bisa dibatalkan');
    }
    const startStr = formatDateOnly(req.startDate);
    if (req.status === 'approved' && startStr <= todayIn()) {
      throw new BadRequestException('Cuti yang sudah berjalan atau lewat tidak bisa dibatalkan');
    }

    const settings = await this.prisma.companySettings.findUnique({ where: { companyId: user.companyId } });
    const endStr = formatDateOnly(req.endDate);
    const holidayDates = await this.loadHolidaySet(user.companyId, startStr, endStr);
    const calc = calculateLeaveDays({
      startDate: startStr,
      endDate: endStr,
      isHalfDay: req.isHalfDay,
      countsWorkingDaysOnly: req.leaveType.countsWorkingDaysOnly,
      workPattern: req.employee.workPattern ?? settings?.defaultWorkPattern ?? 'FIVE_DAY',
      holidayDates,
    });

    return this.prisma.$transaction(async (tx) => {
      if (req.status === 'approved' && req.leaveType.defaultQuotaDays !== null) {
        for (const [yearStr, days] of Object.entries(calc.byYear)) {
          await tx.leaveBalance.updateMany({
            where: { employeeId: req.employeeId, leaveTypeId: req.leaveTypeId, year: Number(yearStr) },
            data: { usedDays: { decrement: new Prisma.Decimal(days) }, version: { increment: 1 } },
          });
        }
      }
      const updated = await tx.leaveRequest.update({ where: { id }, data: { status: 'cancelled' } });
      await this.audit.record(tx, ctx, { tableName: 'leave_requests', recordId: id, action: 'update', oldValue: req, newValue: updated });
      return updated;
    });
  }

  // ───────────── Helpers ─────────────

  private async loadHolidaySet(companyId: string, from: string, to: string): Promise<Set<string>> {
    const rows = await this.prisma.holiday.findMany({
      where: {
        OR: [{ companyId: null }, { companyId }],
        date: { gte: parseDateOnly(from), lte: parseDateOnly(to) },
      },
      select: { date: true },
    });
    return new Set(rows.map((r) => formatDateOnly(r.date)));
  }

  private formatBalance<T extends { quotaDays: Prisma.Decimal; carriedOverDays: Prisma.Decimal; usedDays: Prisma.Decimal; carriedOverExpiresAt: Date | null }>(b: T) {
    const quotaDays = Number(b.quotaDays);
    const carriedOverDays = Number(b.carriedOverDays);
    const usedDays = Number(b.usedDays);
    return {
      ...b,
      quotaDays,
      carriedOverDays,
      usedDays,
      remainingDays: Math.max(0, quotaDays + carriedOverDays - usedDays),
      carriedOverExpiresAt: formatDateOnly(b.carriedOverExpiresAt),
    };
  }

  private formatRequest<T extends { startDate: Date; endDate: Date; totalDays: Prisma.Decimal }>(r: T) {
    return {
      ...r,
      startDate: formatDateOnly(r.startDate),
      endDate: formatDateOnly(r.endDate),
      totalDays: Number(r.totalDays),
    };
  }
}
