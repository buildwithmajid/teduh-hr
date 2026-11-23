import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { OvertimeDayType, RequestStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApprovalDecisionDto } from '../attendance/attendance.dto';
import { Audit, AuditContext, AuthUser, CurrentUser, RequirePermissions } from '../common/auth-context';
import { OvertimeService } from './overtime.service';

class CreateOvertimeDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  workDate: string;

  @IsDateString()
  startTime: string;

  @IsDateString()
  endTime: string;

  @IsEnum(OvertimeDayType)
  dayType: OvertimeDayType;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

@Controller('overtime')
export class OvertimeController {
  constructor(private readonly overtime: OvertimeService) {}

  @Get('me/quota')
  myQuota(@CurrentUser() u: AuthUser, @Query('date') date?: string) {
    return this.overtime.getMyQuota(u, date);
  }

  @Get('me')
  listMine(@CurrentUser() u: AuthUser) {
    return this.overtime.listMine(u);
  }

  @Get()
  @RequirePermissions('overtime.view')
  listCompany(@CurrentUser() u: AuthUser, @Query('status') status?: RequestStatus) {
    return this.overtime.listCompany(u.companyId, status);
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Body() dto: CreateOvertimeDto) {
    return this.overtime.create(u, ctx, dto);
  }

  @Post(':id/approve')
  @HttpCode(200)
  approve(
    @CurrentUser() u: AuthUser,
    @Audit() ctx: AuditContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovalDecisionDto,
  ) {
    return this.overtime.decide(u, ctx, id, 'approved', dto.notes);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(
    @CurrentUser() u: AuthUser,
    @Audit() ctx: AuditContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovalDecisionDto,
  ) {
    return this.overtime.decide(u, ctx, id, 'rejected', dto.notes);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.overtime.cancel(u, ctx, id);
  }
}
