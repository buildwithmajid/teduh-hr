import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Audit, AuditContext, AuthUser, CurrentUser, RequirePermissions } from '../common/auth-context';
import {
  ApprovalDecisionDto,
  AssignScheduleDto,
  AttendanceListQuery,
  ClockDto,
  CreateCorrectionDto,
  CreateHolidayDto,
  CreateShiftDto,
  UpdateShiftDto,
} from './attendance.dto';
import { AttendanceService } from './attendance.service';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('me/today')
  myToday(@CurrentUser() u: AuthUser) {
    return this.attendance.getMyToday(u);
  }

  @Post('clock-in')
  clockIn(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Body() dto: ClockDto) {
    return this.attendance.clockIn(u, ctx, dto);
  }

  @Post('clock-out')
  clockOut(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Body() dto: ClockDto) {
    return this.attendance.clockOut(u, ctx, dto);
  }

  @Get('me')
  listMine(@CurrentUser() u: AuthUser, @Query() q: AttendanceListQuery) {
    return this.attendance.listMine(u, q);
  }

  @Get('team')
  @RequirePermissions('attendance.view_team')
  listTeam(@CurrentUser() u: AuthUser, @Query() q: AttendanceListQuery) {
    return this.attendance.listTeam(u, q);
  }

  @Get()
  @RequirePermissions('attendance.view')
  listCompany(@CurrentUser() u: AuthUser, @Query() q: AttendanceListQuery) {
    return this.attendance.listCompany(u.companyId, q);
  }

  // ───────────── Corrections ─────────────

  @Get('corrections/me')
  listMyCorrections(@CurrentUser() u: AuthUser) {
    return this.attendance.listMyCorrections(u);
  }

  @Post('corrections')
  createCorrection(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Body() dto: CreateCorrectionDto) {
    return this.attendance.createCorrection(u, ctx, dto);
  }

  @Post('corrections/:id/approve')
  @HttpCode(200)
  approveCorrection(
    @CurrentUser() u: AuthUser,
    @Audit() ctx: AuditContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovalDecisionDto,
  ) {
    return this.attendance.decideCorrection(u, ctx, id, 'approved', dto.notes);
  }

  @Post('corrections/:id/reject')
  @HttpCode(200)
  rejectCorrection(
    @CurrentUser() u: AuthUser,
    @Audit() ctx: AuditContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovalDecisionDto,
  ) {
    return this.attendance.decideCorrection(u, ctx, id, 'rejected', dto.notes);
  }

  @Post('corrections/:id/cancel')
  @HttpCode(200)
  cancelCorrection(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.attendance.cancelCorrection(u, ctx, id);
  }
}

@Controller('shifts')
export class ShiftsController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.attendance.listShifts(u.companyId);
  }

  @Post()
  @RequirePermissions('shift.manage')
  create(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Body() dto: CreateShiftDto) {
    return this.attendance.createShift(u.companyId, ctx, dto);
  }

  @Patch(':id')
  @RequirePermissions('shift.manage')
  update(
    @CurrentUser() u: AuthUser,
    @Audit() ctx: AuditContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShiftDto,
  ) {
    return this.attendance.updateShift(u.companyId, ctx, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('shift.manage')
  remove(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.attendance.deleteShift(u.companyId, ctx, id);
  }

  @Post('schedules')
  @RequirePermissions('shift.manage')
  assignSchedule(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Body() dto: AssignScheduleDto) {
    return this.attendance.assignSchedule(u.companyId, ctx, dto);
  }
}

@Controller('holidays')
export class HolidaysController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query('year') year?: string) {
    return this.attendance.listHolidays(u.companyId, year ? Number(year) : undefined);
  }

  @Post()
  @RequirePermissions('holiday.manage')
  create(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Body() dto: CreateHolidayDto) {
    return this.attendance.createHoliday(u.companyId, ctx, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('holiday.manage')
  remove(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.attendance.deleteHoliday(u.companyId, ctx, id);
  }
}
