import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OvertimeDayType, Prisma, RequestStatus } from '@prisma/client';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditService } from '../audit/audit.service';
import { AuditContext, AuthUser } from '../common/auth-context';
import { formatDateOnly, parseDateOnly, todayIn } from '../common/dates';
import { isoWeekBounds } from '../leave/leave.utils';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

/** Batas lembur hari kerja sesuai PP 35/2021. */
const MAX_WORKDAY_HOURS_PER_DAY = 4;
const MAX_WORKDAY_HOURS_PER_WEEK = 18;

export interface CreateOvertimeInput {
  workDate: string;
  startTime: string;
  endTime: string;
  dayType: OvertimeDayType;
  reason: string;
}

@Injectable()
export class OvertimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly approvals: ApprovalsService,
    private readonly notifications: NotificationsService,
  ) {}

  async getMyQuota(user: AuthUser, dateStr = todayIn()) {
    if (!user.employeeId) return { eligible: false, usedWeekHours: 0, maxWeekHours: MAX_WORKDAY_HOURS_PER_WEEK, weekStart: dateStr, weekEnd: dateStr };
    const emp = await this.prisma.employee.findUniqueOrThrow({
      where: { id: user.employeeId },
      include: { position: { select: { overtimeEligible: true } } },
    });
    const eligible = emp.overtimeEligible ?? emp.position.overtimeEligible;
    const { monday, sunday } = isoWeekBounds(dateStr);
    const agg = await this.prisma.overtimeEntry.aggregate({
      where: {
        employeeId: emp.id,
        dayType: 'workday',
        status: { in: ['pending', 'approved'] },
        workDate: { gte: monday, lte: sunday },
      },
      _sum: { hours: true },
    });
    return {
      eligible,
      usedWeekHours: Number(agg._sum.hours ?? 0),
      maxWeekHours: MAX_WORKDAY_HOURS_PER_WEEK,
      maxDayHours: MAX_WORKDAY_HOURS_PER_DAY,
      weekStart: formatDateOnly(monday),
      weekEnd: formatDateOnly(sunday),
    };
  }

  async listMine(user: AuthUser) {
    if (!user.employeeId) return [];
    const rows = await this.prisma.overtimeEntry.findMany({
      where: { employeeId: user.employeeId },
      orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }],
      take: 60,
    });
    return rows.map((r) => this.formatRow(r));
  }

  async listCompany(companyId: string, status?: RequestStatus) {
    const rows = await this.prisma.overtimeEntry.findMany({
      where: { employee: { companyId }, ...(status ? { status } : {}) },
      include: {
        employee: { select: { id: true, fullName: true, employeeCode: true, department: { select: { name: true } } } },
      },
      orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
    return rows.map((r) => ({ ...this.formatRow(r), employee: r.employee }));
  }

  async create(user: AuthUser, ctx: AuditContext, dto: CreateOvertimeInput) {
    if (!user.employeeId) throw new NotFoundException('Akun ini tidak terhubung ke data karyawan');
    const emp = await this.prisma.employee.findUniqueOrThrow({
      where: { id: user.employeeId },
      include: { position: { select: { overtimeEligible: true } } },
    });
    if (emp.employmentStatus !== 'active') throw new ConflictException('Karyawan sudah tidak aktif');
    const eligible = emp.overtimeEligible ?? emp.position.overtimeEligible;
    if (!eligible) throw new BadRequestException('Jabatan atau status Anda tidak berhak mengajukan lembur');

    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      throw new BadRequestException('Jam selesai lembur harus setelah jam mulai');
    }
    const hours = Math.round(((end.getTime() - start.getTime()) / 3_600_000) * 100) / 100;
    if (hours <= 0 || hours > 12) throw new BadRequestException('Durasi lembur harus antara 0,5 hingga 12 jam');

    const workDate = parseDateOnly(dto.workDate);

    // Validasi PP 35/2021 untuk hari kerja: maks 4 jam/hari & 18 jam/minggu
    if (dto.dayType === 'workday') {
      const dayAgg = await this.prisma.overtimeEntry.aggregate({
        where: { employeeId: emp.id, workDate, dayType: 'workday', status: { in: ['pending', 'approved'] } },
        _sum: { hours: true },
      });
      const dayTotal = Number(dayAgg._sum.hours ?? 0) + hours;
      if (dayTotal > MAX_WORKDAY_HOURS_PER_DAY) {
        throw new BadRequestException(
          `Lembur hari kerja maksimal ${MAX_WORKDAY_HOURS_PER_DAY} jam/hari sesuai PP 35/2021 (total menjadi ${dayTotal} jam)`,
        );
      }

      const { monday, sunday } = isoWeekBounds(dto.workDate);
      const weekAgg = await this.prisma.overtimeEntry.aggregate({
        where: {
          employeeId: emp.id,
          dayType: 'workday',
          status: { in: ['pending', 'approved'] },
          workDate: { gte: monday, lte: sunday },
        },
        _sum: { hours: true },
      });
      const weekTotal = Number(weekAgg._sum.hours ?? 0) + hours;
      if (weekTotal > MAX_WORKDAY_HOURS_PER_WEEK) {
        throw new BadRequestException(
          `Lembur hari kerja maksimal ${MAX_WORKDAY_HOURS_PER_WEEK} jam/minggu sesuai PP 35/2021 (total minggu ini menjadi ${weekTotal} jam)`,
        );
      }
    }

    const wf = await this.approvals.getActiveWorkflow(user.companyId, 'overtime');

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.overtimeEntry.create({
        data: {
          employeeId: emp.id,
          workDate,
          startTime: start,
          endTime: end,
          hours: new Prisma.Decimal(hours),
          dayType: dto.dayType,
          reason: dto.reason.trim(),
          workflowId: wf.id,
          currentApprovalStep: 1,
          status: 'pending',
        },
      });
      await this.audit.record(tx, ctx, { tableName: 'overtime_entries', recordId: row.id, action: 'create', newValue: row });
      await this.approvals.notifyStepApprovers(
        tx,
        user.companyId,
        emp.id,
        wf.id,
        1,
        'overtime',
        'Pengajuan lembur baru',
        `${emp.fullName} mengajukan lembur ${hours} jam pada ${dto.workDate}.`,
      );
      return this.formatRow(row);
    });
  }

  async decide(user: AuthUser, ctx: AuditContext, id: string, decision: 'approved' | 'rejected', notes?: string) {
    const req = await this.prisma.overtimeEntry.findFirst({
      where: { id, employee: { companyId: user.companyId } },
      include: { employee: true },
    });
    if (!req) throw new NotFoundException('Pengajuan lembur tidak ditemukan');
    if (req.status !== 'pending') throw new ConflictException('Pengajuan lembur ini sudah diproses');

    const { step, totalSteps, onBehalfOf } = await this.approvals.assertCanAct(
      user.companyId,
      req.employeeId,
      req.workflowId,
      req.currentApprovalStep,
      'overtime',
      user.userId,
    );

    return this.prisma.$transaction(async (tx) => {
      await this.approvals.recordDecision(tx, ctx, {
        requestType: 'overtime',
        requestId: req.id,
        stepId: step.id,
        approverId: user.userId,
        onBehalfOf,
        action: decision,
        notes,
      });

      if (decision === 'rejected') {
        const updated = await tx.overtimeEntry.update({ where: { id }, data: { status: 'rejected' } });
        if (req.employee.userId) {
          await this.notifications.create(tx, {
            userId: req.employee.userId,
            type: 'overtime_rejected',
            title: 'Pengajuan lembur ditolak',
            message: `Pengajuan lembur tanggal ${formatDateOnly(req.workDate)} ditolak.${notes ? ` Catatan: ${notes}` : ''}`,
            linkUrl: '/overtime',
          });
        }
        return updated;
      }

      if (req.currentApprovalStep < totalSteps) {
        const nextStep = req.currentApprovalStep + 1;
        const updated = await tx.overtimeEntry.update({ where: { id }, data: { currentApprovalStep: nextStep } });
        await this.approvals.notifyStepApprovers(
          tx,
          user.companyId,
          req.employeeId,
          req.workflowId,
          nextStep,
          'overtime',
          'Pengajuan lembur menunggu persetujuan',
          `${req.employee.fullName} — lembur ${Number(req.hours)} jam (${formatDateOnly(req.workDate)}) menunggu tahap ${nextStep}.`,
        );
        return updated;
      }

      const updated = await tx.overtimeEntry.update({ where: { id }, data: { status: 'approved' } });
      if (req.employee.userId) {
        await this.notifications.create(tx, {
          userId: req.employee.userId,
          type: 'overtime_approved',
          title: 'Pengajuan lembur disetujui',
          message: `Pengajuan lembur ${Number(req.hours)} jam tanggal ${formatDateOnly(req.workDate)} telah disetujui.`,
          linkUrl: '/overtime',
        });
      }
      return updated;
    });
  }

  async cancel(user: AuthUser, ctx: AuditContext, id: string) {
    const req = await this.prisma.overtimeEntry.findFirst({ where: { id, employeeId: user.employeeId ?? '' } });
    if (!req) throw new NotFoundException('Pengajuan lembur tidak ditemukan');
    if (req.status !== 'pending') throw new ConflictException('Hanya pengajuan pending yang bisa dibatalkan');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.overtimeEntry.update({ where: { id }, data: { status: 'cancelled' } });
      await this.audit.record(tx, ctx, { tableName: 'overtime_entries', recordId: id, action: 'update', oldValue: req, newValue: updated });
      return updated;
    });
  }

  private formatRow<T extends { workDate: Date; hours: Prisma.Decimal }>(r: T) {
    return { ...r, workDate: formatDateOnly(r.workDate), hours: Number(r.hours) };
  }
}
