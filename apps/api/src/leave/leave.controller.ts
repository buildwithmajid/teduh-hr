import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Gender, RequestStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApprovalDecisionDto } from '../attendance/attendance.dto';
import { Audit, AuditContext, AuthUser, CurrentUser, RequirePermissions } from '../common/auth-context';
import { LeaveService } from './leave.service';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

class CreateLeaveTypeDto {
  @Matches(/^[a-z][a-z0-9_]{1,29}$/)
  code: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(365)
  defaultQuotaDays?: number | null;

  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresDocument?: boolean;

  @IsOptional()
  @IsEnum(Gender)
  genderRestriction?: Gender | null;

  @IsOptional()
  @IsBoolean()
  allowHalfDay?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  minServiceMonths?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(30)
  maxCarryOverDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  carryOverExpiryMonths?: number | null;

  @IsOptional()
  @IsBoolean()
  countsWorkingDaysOnly?: boolean;
}

class CreateLeaveRequestDto {
  @IsUUID()
  leaveTypeId: string;

  @Matches(DATE_RE)
  startDate: string;

  @Matches(DATE_RE)
  endDate: string;

  @IsOptional()
  @IsBoolean()
  isHalfDay?: boolean;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  attachmentKey?: string;
}

class AdjustBalanceDto {
  @IsUUID()
  employeeId: string;

  @IsUUID()
  leaveTypeId: string;

  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(365)
  quotaDays: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(365)
  carriedOverDays?: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

@Controller('leaves')
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  @Get('types')
  listTypes(@CurrentUser() u: AuthUser) {
    return this.leave.listTypes(u.companyId);
  }

  @Post('types')
  @RequirePermissions('leave.manage')
  createType(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Body() dto: CreateLeaveTypeDto) {
    return this.leave.createType(u.companyId, ctx, dto);
  }

  @Get('balances/me')
  myBalances(@CurrentUser() u: AuthUser, @Query('year') year?: string) {
    return this.leave.listMyBalances(u, year ? Number(year) : undefined);
  }

  @Post('balances/adjust')
  @RequirePermissions('leave.adjust_balance')
  adjustBalance(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Body() dto: AdjustBalanceDto) {
    return this.leave.adjustBalance(u, ctx, dto);
  }

  @Get('preview')
  preview(
    @CurrentUser() u: AuthUser,
    @Query('leaveTypeId') leaveTypeId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('isHalfDay') isHalfDay?: string,
  ) {
    return this.leave.previewDays(u, leaveTypeId, startDate, endDate, isHalfDay === 'true');
  }

  @Get('requests/me')
  myRequests(@CurrentUser() u: AuthUser) {
    return this.leave.listMyRequests(u);
  }

  @Get('requests')
  @RequirePermissions('leave.view')
  companyRequests(@CurrentUser() u: AuthUser, @Query('status') status?: RequestStatus) {
    return this.leave.listCompanyRequests(u.companyId, status);
  }

  @Post('requests')
  createRequest(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Body() dto: CreateLeaveRequestDto) {
    return this.leave.createRequest(u, ctx, dto);
  }

  @Post('requests/:id/approve')
  @HttpCode(200)
  approve(
    @CurrentUser() u: AuthUser,
    @Audit() ctx: AuditContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovalDecisionDto,
  ) {
    return this.leave.decideRequest(u, ctx, id, 'approved', dto.notes);
  }

  @Post('requests/:id/reject')
  @HttpCode(200)
  reject(
    @CurrentUser() u: AuthUser,
    @Audit() ctx: AuditContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovalDecisionDto,
  ) {
    return this.leave.decideRequest(u, ctx, id, 'rejected', dto.notes);
  }

  @Post('requests/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.leave.cancelRequest(u, ctx, id);
  }
}
