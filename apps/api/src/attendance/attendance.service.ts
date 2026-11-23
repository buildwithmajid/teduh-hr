import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditService } from '../audit/audit.service';
import { AuditContext, AuthUser } from '../common/auth-context';
import { formatDateOnly, parseDateOnly, todayIn } from '../common/dates';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AssignScheduleDto,
  AttendanceListQuery,
  ClockDto,
  CreateCorrectionDto,
  CreateHolidayDto,
  CreateShiftDto,
  UpdateShiftDto,
} from './attendance.dto';
import { computeLateMinutes, haversineMeters, resolveWorkDateStr } from './attendance.utils';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly approvals: ApprovalsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ───────────── Clock-in / Clock-out ─────────────

  async getMyToday(user: AuthUser) {
    if (!user.employeeId) throw new NotFoundException('Akun ini tidak terhubung ke data karyawan');
    const emp = await this.prisma.employee.findUniqueOrThrow({
      where: { id: user.employeeId },
      include: { workLocation: true },
    });
    const tz = emp.workLocation?.timezone ?? 'Asia/Jakarta';
    const shift = await this.resolveShiftForDate(emp.companyId, emp.id, todayIn(tz));
    const workDateStr = resolveWorkDateStr(new Date(), tz, shift?.isOvernight, shift?.endTime);
    const record = await this.prisma.attendance.findUnique({
      where: { employeeId_workDate: { employeeId: emp.id, workDate: parseDateOnly(workDateStr) } },
      include: { shift: true },
    });
    return {
      workDate: workDateStr,
      timezone: tz,
      workLocation: emp.workLocation
        ? {
            id: emp.workLocation.id,
            name: emp.workLocation.name,
            latitude: Number(emp.workLocation.latitude),
            longitude: Number(emp.workLocation.longitude),
            radiusMeters: emp.workLocation.radiusMeters,
            timezone: emp.workLocation.timezone,
          }
        : null,
      shift,
      attendance: record ? this.formatAttendance(record) : null,
    };
  }

  async clockIn(user: AuthUser, ctx: AuditContext, dto: ClockDto) {
    if (!user.employeeId) throw new NotFoundException('Akun ini tidak terhubung ke data karyawan');
    const emp = await this.prisma.employee.findUniqueOrThrow({
      where: { id: user.employeeId },
      include: { workLocation: true },
    });
    if (emp.employmentStatus !== 'active') throw new ConflictException('Karyawan sudah tidak aktif');

    const now = new Date();
    const tz = emp.workLocation?.timezone ?? 'Asia/Jakarta';
    const shift = await this.resolveShiftForDate(emp.companyId, emp.id, todayIn(tz, now));
    const workDateStr = resolveWorkDateStr(now, tz, shift?.isOvernight, shift?.endTime);
    const workDate = parseDateOnly(workDateStr);

    const existing = await this.prisma.attendance.findUnique({
      where: { employeeId_workDate: { employeeId: emp.id, workDate } },
    });
    if (existing?.clockInTime) throw new ConflictException('Anda sudah melakukan clock-in hari ini');

    const { distance, flags } = this.evaluateLocation(emp.workLocation, dto.lat, dto.lng);
    const lateMinutes = shift
      ? computeLateMinutes(now, shift.startTime, shift.lateToleranceMinutes, tz, shift.isOvernight)
      : 0;
    const status = lateMinutes > 0 ? 'late' : 'present';

    return this.prisma.$transaction(async (tx) => {
      const row = existing
        ? await tx.attendance.update({
            where: { id: existing.id },
            data: {
              shiftId: shift?.id ?? existing.shiftId,
              clockInTime: now,
              clockInLat: dto.lat !== undefined ? new Prisma.Decimal(dto.lat) : null,
              clockInLng: dto.lng !== undefined ? new Prisma.Decimal(dto.lng) : null,
              clockInDistanceM: distance,
              deviceFingerprint: dto.deviceFingerprint ?? null,
              ipAddress: ctx.ipAddress,
              lateMinutes,
              anomalyFlags: flags,
              status,
              notes: dto.notes ?? existing.notes,
            },
            include: { shift: true },
          })
        : await tx.attendance.create({
            data: {
              employeeId: emp.id,
              shiftId: shift?.id ?? null,
              workDate,
              clockInTime: now,
              clockInLat: dto.lat !== undefined ? new Prisma.Decimal(dto.lat) : null,
              clockInLng: dto.lng !== undefined ? new Prisma.Decimal(dto.lng) : null,
              clockInDistanceM: distance,
              deviceFingerprint: dto.deviceFingerprint ?? null,
              ipAddress: ctx.ipAddress,
              lateMinutes,
              anomalyFlags: flags,
              status,
              notes: dto.notes ?? null,
            },
            include: { shift: true },
          });

      await this.audit.record(tx, ctx, {
        tableName: 'attendance',
        recordId: row.id,
        action: existing ? 'update' : 'create',
        newValue: { workDate: workDateStr, clockInTime: now, lateMinutes, anomalyFlags: flags },
      });
      return this.formatAttendance(row);
    });
  }

  async clockOut(user: AuthUser, ctx: AuditContext, dto: ClockDto) {
    if (!user.employeeId) throw new NotFoundException('Akun ini tidak terhubung ke data karyawan');
    const emp = await this.prisma.employee.findUniqueOrThrow({
      where: { id: user.employeeId },
      include: { workLocation: true },
    });
    const now = new Date();
    const tz = emp.workLocation?.timezone ?? 'Asia/Jakarta';
    const shift = await this.resolveShiftForDate(emp.companyId, emp.id, todayIn(tz, now));
    const workDateStr = resolveWorkDateStr(now, tz, shift?.isOvernight, shift?.endTime);
    const workDate = parseDateOnly(workDateStr);

    const existing = await this.prisma.attendance.findUnique({
      where: { employeeId_workDate: { employeeId: emp.id, workDate } },
    });
    if (!existing?.clockInTime) throw new BadRequestException('Anda belum melakukan clock-in hari ini');
    if (existing.clockOutTime) throw new ConflictException('Anda sudah melakukan clock-out hari ini');

    const { distance, flags } = this.evaluateLocation(emp.workLocation, dto.lat, dto.lng);
    const mergedFlags = [...new Set([...existing.anomalyFlags, ...flags.map((f) => (f === 'outside_geofence' ? 'clock_out_outside_geofence' : f))])];

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.attendance.update({
        where: { id: existing.id },
        data: {
          clockOutTime: now,
          clockOutLat: dto.lat !== undefined ? new Prisma.Decimal(dto.lat) : null,
          clockOutLng: dto.lng !== undefined ? new Prisma.Decimal(dto.lng) : null,
          clockOutDistanceM: distance,
          anomalyFlags: mergedFlags,
          notes: dto.notes ? [existing.notes, dto.notes].filter(Boolean).join(' · ') : existing.notes,
        },
        include: { shift: true },
      });
      await this.audit.record(tx, ctx, {
        tableName: 'attendance',
        recordId: row.id,
        action: 'update',
        newValue: { workDate: workDateStr, clockOutTime: now, clockOutDistanceM: distance },
      });
      return this.formatAttendance(row);
    });
  }

  // ───────────── Listing ─────────────

  async listMine(user: AuthUser, q: AttendanceListQuery) {
    if (!user.employeeId) return [];
    const where: Prisma.AttendanceWhereInput = {
      employeeId: user.employeeId,
      ...this.dateRangeWhere(q),
    };
    const rows = await this.prisma.attendance.findMany({
      where,
      include: { shift: true },
      orderBy: { workDate: 'desc' },
      take: 62,
    });
    return rows.map((r) => this.formatAttendance(r));
  }

  async listTeam(user: AuthUser, q: AttendanceListQuery) {
    if (!user.employeeId) return [];
    const where: Prisma.AttendanceWhereInput = {
      employee: { companyId: user.companyId, supervisorId: user.employeeId },
      ...this.dateRangeWhere(q),
      ...(q.status ? { status: q.status } : {}),
    };
    const rows = await this.prisma.attendance.findMany({
      where,
      include: {
        shift: true,
        employee: { select: { id: true, fullName: true, employeeCode: true, department: { select: { name: true } } } },
      },
      orderBy: [{ workDate: 'desc' }, { employee: { fullName: 'asc' } }],
      take: 100,
    });
    return rows.map((r) => ({ ...this.formatAttendance(r), employee: r.employee }));
  }

  async listCompany(companyId: string, q: AttendanceListQuery) {
    const where: Prisma.AttendanceWhereInput = {
      employee: { companyId },
      ...(q.employeeId ? { employeeId: q.employeeId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...this.dateRangeWhere(q),
    };
    const rows = await this.prisma.attendance.findMany({
      where,
      include: {
        shift: true,
        employee: { select: { id: true, fullName: true, employeeCode: true, department: { select: { name: true } } } },
      },
      orderBy: [{ workDate: 'desc' }, { employee: { fullName: 'asc' } }],
      take: 200,
    });
    return rows.map((r) => ({ ...this.formatAttendance(r), employee: r.employee }));
  }

  // ───────────── Shifts & Schedules ─────────────

  listShifts(companyId: string) {
    return this.prisma.shift.findMany({ where: { companyId }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] });
  }

  async createShift(companyId: string, ctx: AuditContext, dto: CreateShiftDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.shift.updateMany({ where: { companyId, isDefault: true }, data: { isDefault: false } });
      }
      const shift = await tx.shift.create({
        data: {
          companyId,
          name: dto.name.trim(),
          startTime: dto.startTime,
          endTime: dto.endTime,
          isOvernight: dto.isOvernight ?? false,
          lateToleranceMinutes: dto.lateToleranceMinutes ?? 0,
          workHours: new Prisma.Decimal(dto.workHours),
          isDefault: dto.isDefault ?? false,
        },
      });
      await this.audit.record(tx, ctx, { tableName: 'shifts', recordId: shift.id, action: 'create', newValue: shift });
      return shift;
    });
  }

  async updateShift(companyId: string, ctx: AuditContext, id: string, dto: UpdateShiftDto) {
    const before = await this.prisma.shift.findFirst({ where: { id, companyId } });
    if (!before) throw new NotFoundException('Shift tidak ditemukan');
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.shift.updateMany({ where: { companyId, isDefault: true, NOT: { id } }, data: { isDefault: false } });
      }
      const after = await tx.shift.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          startTime: dto.startTime,
          endTime: dto.endTime,
          isOvernight: dto.isOvernight,
          lateToleranceMinutes: dto.lateToleranceMinutes,
          workHours: dto.workHours === undefined ? undefined : new Prisma.Decimal(dto.workHours),
          isDefault: dto.isDefault,
        },
      });
      await this.audit.record(tx, ctx, { tableName: 'shifts', recordId: id, action: 'update', oldValue: before, newValue: after });
      return after;
    });
  }

  async deleteShift(companyId: string, ctx: AuditContext, id: string) {
    const shift = await this.prisma.shift.findFirst({ where: { id, companyId } });
    if (!shift) throw new NotFoundException('Shift tidak ditemukan');
    const used = await this.prisma.attendance.count({ where: { shiftId: id } });
    if (used > 0) throw new ConflictException('Shift sudah dipakai di catatan absensi');
    await this.prisma.$transaction(async (tx) => {
      await tx.shiftSchedule.deleteMany({ where: { shiftId: id } });
      await tx.shift.delete({ where: { id } });
      await this.audit.record(tx, ctx, { tableName: 'shifts', recordId: id, action: 'delete', oldValue: shift });
    });
  }

  async assignSchedule(companyId: string, ctx: AuditContext, dto: AssignScheduleDto) {
    const emp = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, companyId } });
    if (!emp) throw new NotFoundException('Karyawan tidak ditemukan');
    if (dto.shiftId) {
      const shift = await this.prisma.shift.findFirst({ where: { id: dto.shiftId, companyId } });
      if (!shift) throw new NotFoundException('Shift tidak ditemukan');
    }
    const date = parseDateOnly(dto.date);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.shiftSchedule.upsert({
        where: { employeeId_date: { employeeId: dto.employeeId, date } },
        update: { shiftId: dto.shiftId ?? null },
        create: { employeeId: dto.employeeId, date, shiftId: dto.shiftId ?? null },
      });
      await this.audit.record(tx, ctx, { tableName: 'shift_schedules', recordId: row.id, action: 'update', newValue: row });
      return row;
    });
  }

  // ───────────── Holidays ─────────────

  listHolidays(companyId: string, year?: number) {
    const where: Prisma.HolidayWhereInput = {
      OR: [{ companyId: null }, { companyId }],
      ...(year ? { date: { gte: parseDateOnly(`${year}-01-01`), lte: parseDateOnly(`${year}-12-31`) } } : {}),
    };
    return this.prisma.holiday.findMany({ where, orderBy: { date: 'asc' } });
  }

  async createHoliday(companyId: string, ctx: AuditContext, dto: CreateHolidayDto) {
    const date = parseDateOnly(dto.date);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.holiday.create({
        data: {
          companyId: dto.type === 'company' ? companyId : companyId,
          date,
          name: dto.name.trim(),
          type: dto.type,
          deductsAnnualLeave: dto.deductsAnnualLeave ?? false,
        },
      });
      await this.audit.record(tx, ctx, { tableName: 'holidays', recordId: row.id, action: 'create', newValue: row });
      return { ...row, date: formatDateOnly(row.date) };
    });
  }

  async deleteHoliday(companyId: string, ctx: AuditContext, id: string) {
    const row = await this.prisma.holiday.findFirst({ where: { id, OR: [{ companyId }, { companyId: null }] } });
    if (!row) throw new NotFoundException('Hari libur tidak ditemukan');
    await this.prisma.$transaction(async (tx) => {
      await tx.holiday.delete({ where: { id } });
      await this.audit.record(tx, ctx, { tableName: 'holidays', recordId: id, action: 'delete', oldValue: row });
    });
  }

  // ───────────── Attendance Corrections ─────────────

  async listMyCorrections(user: AuthUser) {
    if (!user.employeeId) return [];
    const rows = await this.prisma.attendanceCorrection.findMany({
      where: { employeeId: user.employeeId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => ({ ...r, workDate: formatDateOnly(r.workDate) }));
  }

  async createCorrection(user: AuthUser, ctx: AuditContext, dto: CreateCorrectionDto) {
    if (!user.employeeId) throw new NotFoundException('Akun ini tidak terhubung ke data karyawan');
    if (!dto.requestedClockIn && !dto.requestedClockOut) {
      throw new BadRequestException('Isi minimal jam masuk atau jam pulang yang dikoreksi');
    }
    const workDate = parseDateOnly(dto.workDate);
    if (dto.workDate > todayIn()) throw new BadRequestException('Tidak bisa mengoreksi absensi tanggal di masa depan');

    const emp = await this.prisma.employee.findUniqueOrThrow({ where: { id: user.employeeId } });
    const existing = await this.prisma.attendance.findUnique({
      where: { employeeId_workDate: { employeeId: emp.id, workDate } },
    });
    const wf = await this.approvals.getActiveWorkflow(user.companyId, 'attendance_correction');

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.attendanceCorrection.create({
        data: {
          attendanceId: existing?.id ?? null,
          employeeId: emp.id,
          workDate,
          requestedClockIn: dto.requestedClockIn ? new Date(dto.requestedClockIn) : null,
          requestedClockOut: dto.requestedClockOut ? new Date(dto.requestedClockOut) : null,
          reason: dto.reason.trim(),
          workflowId: wf.id,
          currentApprovalStep: 1,
          status: 'pending',
        },
      });
      await this.audit.record(tx, ctx, { tableName: 'attendance_corrections', recordId: row.id, action: 'create', newValue: row });
      await this.approvals.notifyStepApprovers(
        tx,
        user.companyId,
        emp.id,
        wf.id,
        1,
        'attendance_correction',
        'Pengajuan koreksi absensi',
        `${emp.fullName} mengajukan koreksi absensi tanggal ${dto.workDate}.`,
      );
      return { ...row, workDate: dto.workDate };
    });
  }

  async decideCorrection(user: AuthUser, ctx: AuditContext, id: string, decision: 'approved' | 'rejected', notes?: string) {
    const req = await this.prisma.attendanceCorrection.findFirst({
      where: { id, employee: { companyId: user.companyId } },
      include: { employee: { include: { workLocation: true } } },
    });
    if (!req) throw new NotFoundException('Pengajuan koreksi tidak ditemukan');
    if (req.status !== 'pending') throw new ConflictException('Pengajuan ini sudah diproses');

    const { step, totalSteps, onBehalfOf } = await this.approvals.assertCanAct(
      user.companyId,
      req.employeeId,
      req.workflowId,
      req.currentApprovalStep,
      'attendance_correction',
      user.userId,
    );

    return this.prisma.$transaction(async (tx) => {
      await this.approvals.recordDecision(tx, ctx, {
        requestType: 'attendance_correction',
        requestId: req.id,
        stepId: step.id,
        approverId: user.userId,
        onBehalfOf,
        action: decision,
        notes,
      });

      if (decision === 'rejected') {
        const updated = await tx.attendanceCorrection.update({ where: { id }, data: { status: 'rejected' } });
        if (req.employee.userId) {
          await this.notifications.create(tx, {
            userId: req.employee.userId,
            type: 'attendance_correction_rejected',
            title: 'Koreksi absensi ditolak',
            message: `Koreksi absensi tanggal ${formatDateOnly(req.workDate)} ditolak.${notes ? ` Catatan: ${notes}` : ''}`,
            linkUrl: '/attendance',
          });
        }
        return updated;
      }

      if (req.currentApprovalStep < totalSteps) {
        const nextStep = req.currentApprovalStep + 1;
        const updated = await tx.attendanceCorrection.update({
          where: { id },
          data: { currentApprovalStep: nextStep },
        });
        await this.approvals.notifyStepApprovers(
          tx,
          user.companyId,
          req.employeeId,
          req.workflowId,
          nextStep,
          'attendance_correction',
          'Pengajuan koreksi absensi',
          `${req.employee.fullName} menunggu persetujuan tahap ${nextStep}.`,
        );
        return updated;
      }

      // Final approval → terapkan ke tabel attendance
      const tz = req.employee.workLocation?.timezone ?? 'Asia/Jakarta';
      const shift = await this.resolveShiftForDate(user.companyId, req.employeeId, formatDateOnly(req.workDate));
      const existing = await tx.attendance.findUnique({
        where: { employeeId_workDate: { employeeId: req.employeeId, workDate: req.workDate } },
      });
      const clockIn = req.requestedClockIn ?? existing?.clockInTime ?? null;
      const clockOut = req.requestedClockOut ?? existing?.clockOutTime ?? null;
      const lateMinutes =
        clockIn && shift
          ? computeLateMinutes(clockIn, shift.startTime, shift.lateToleranceMinutes, tz, shift.isOvernight)
          : 0;
      const status = lateMinutes > 0 ? 'late' : 'present';

      const att = existing
        ? await tx.attendance.update({
            where: { id: existing.id },
            data: { clockInTime: clockIn, clockOutTime: clockOut, lateMinutes, status, notes: `Dikoreksi: ${req.reason}` },
          })
        : await tx.attendance.create({
            data: {
              employeeId: req.employeeId,
              shiftId: shift?.id ?? null,
              workDate: req.workDate,
              clockInTime: clockIn,
              clockOutTime: clockOut,
              lateMinutes,
              status,
              notes: `Dikoreksi: ${req.reason}`,
            },
          });

      const updated = await tx.attendanceCorrection.update({
        where: { id },
        data: { status: 'approved', attendanceId: att.id },
      });
      if (req.employee.userId) {
        await this.notifications.create(tx, {
          userId: req.employee.userId,
          type: 'attendance_correction_approved',
          title: 'Koreksi absensi disetujui',
          message: `Koreksi absensi tanggal ${formatDateOnly(req.workDate)} telah disetujui dan diperbarui.`,
          linkUrl: '/attendance',
        });
      }
      return updated;
    });
  }

  async cancelCorrection(user: AuthUser, ctx: AuditContext, id: string) {
    const req = await this.prisma.attendanceCorrection.findFirst({ where: { id, employeeId: user.employeeId ?? '' } });
    if (!req) throw new NotFoundException('Pengajuan koreksi tidak ditemukan');
    if (req.status !== 'pending') throw new ConflictException('Hanya pengajuan pending yang bisa dibatalkan');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.attendanceCorrection.update({ where: { id }, data: { status: 'cancelled' } });
      await this.audit.record(tx, ctx, { tableName: 'attendance_corrections', recordId: id, action: 'update', oldValue: req, newValue: updated });
      return updated;
    });
  }

  // ───────────── Helpers ─────────────

  private async resolveShiftForDate(companyId: string, employeeId: string, dateStr: string) {
    const sched = await this.prisma.shiftSchedule.findUnique({
      where: { employeeId_date: { employeeId, date: parseDateOnly(dateStr) } },
      include: { shift: true },
    });
    if (sched) return sched.shift;
    return this.prisma.shift.findFirst({ where: { companyId, isDefault: true } });
  }

  private evaluateLocation(
    loc: { latitude: Prisma.Decimal; longitude: Prisma.Decimal; radiusMeters: number } | null,
    lat?: number,
    lng?: number,
  ): { distance: number | null; flags: string[] } {
    if (!loc) return { distance: null, flags: [] };
    if (lat === undefined || lng === undefined) return { distance: null, flags: ['missing_location'] };
    const distance = haversineMeters(Number(loc.latitude), Number(loc.longitude), lat, lng);
    const flags = distance > loc.radiusMeters ? ['outside_geofence'] : [];
    return { distance, flags };
  }

  private dateRangeWhere(q: AttendanceListQuery): Prisma.AttendanceWhereInput {
    if (!q.from && !q.to) return {};
    return {
      workDate: {
        ...(q.from ? { gte: parseDateOnly(q.from) } : {}),
        ...(q.to ? { lte: parseDateOnly(q.to) } : {}),
      },
    };
  }

  private formatAttendance<T extends { workDate: Date; clockInLat: Prisma.Decimal | null; clockInLng: Prisma.Decimal | null; clockOutLat: Prisma.Decimal | null; clockOutLng: Prisma.Decimal | null }>(row: T) {
    return {
      ...row,
      workDate: formatDateOnly(row.workDate),
      clockInLat: row.clockInLat ? Number(row.clockInLat) : null,
      clockInLng: row.clockInLng ? Number(row.clockInLng) : null,
      clockOutLat: row.clockOutLat ? Number(row.clockOutLat) : null,
      clockOutLng: row.clockOutLng ? Number(row.clockOutLng) : null,
    };
  }
}
