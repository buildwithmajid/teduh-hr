import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PayrollRunType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Audit, AuditContext, AuthUser, CurrentUser, RequirePermissions } from '../common/auth-context';
import { PayrollService } from './payroll.service';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

class CreatePayrollPeriodDto {
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @IsOptional()
  @IsEnum(PayrollRunType)
  runType?: PayrollRunType;

  @Matches(DATE_RE)
  attendanceStart: string;

  @Matches(DATE_RE)
  attendanceEnd: string;

  @Matches(DATE_RE)
  payDate: string;

  @IsOptional()
  @IsBoolean()
  isFinalTaxPeriod?: boolean;
}

class RejectPayrollDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  notes: string;
}

class SimulatePayrollDto {
  @IsUUID()
  employeeId: string;

  @Matches(DATE_RE)
  periodStart: string;

  @Matches(DATE_RE)
  periodEnd: string;

  @IsOptional()
  @IsBoolean()
  isFinalTaxPeriod?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  periodTotalDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(31)
  presentDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(31)
  absentDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(31)
  unpaidLeaveDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  irregularBonus?: number;
}

@Controller('payroll')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get('rates')
  @RequirePermissions('salary.view')
  getRates(@CurrentUser() u: AuthUser, @Query('asOf') asOf?: string) {
    return this.payroll.getRates(u.companyId, asOf);
  }

  @Post('simulate')
  @HttpCode(200)
  @RequirePermissions('employee.view_sensitive', 'salary.view')
  simulate(@CurrentUser() u: AuthUser, @Body() dto: SimulatePayrollDto) {
    return this.payroll.simulateForEmployee(u, dto);
  }

  // ───────────── Payroll Runs ─────────────

  @Get('analytics')
  @RequirePermissions('payroll.view')
  getAnalytics(@CurrentUser() u: AuthUser) {
    return this.payroll.getAnalytics(u.companyId);
  }

  @Get('periods')
  @RequirePermissions('payroll.view')
  listPeriods(@CurrentUser() u: AuthUser) {
    return this.payroll.listPeriods(u.companyId);
  }

  @Post('periods')
  @RequirePermissions('payroll.run')
  createPeriod(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Body() dto: CreatePayrollPeriodDto) {
    return this.payroll.createAndRunPeriod(u, ctx, dto);
  }

  @Get('periods/:id')
  @RequirePermissions('payroll.view')
  getPeriod(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.payroll.getPeriodDetail(u, ctx, id);
  }

  @Get('periods/:id/export')
  @RequirePermissions('payroll.view')
  async exportPeriod(
    @CurrentUser() u: AuthUser,
    @Audit() ctx: AuditContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('type') type: string,
    @Res() res: Response,
  ) {
    if (type !== 'bank' && type !== 'bpjs' && type !== 'pph21') {
      throw new BadRequestException('Parameter type harus bank, bpjs, atau pph21');
    }
    const { filename, csv } = await this.payroll.exportPeriodCsv(u, ctx, id, type);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv);
  }

  @Post('periods/:id/recalculate')
  @HttpCode(200)
  @RequirePermissions('payroll.run')
  recalculate(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.payroll.runBatchCalculation(u, ctx, id);
  }

  @Post('periods/:id/submit')
  @HttpCode(200)
  @RequirePermissions('payroll.run')
  submit(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.payroll.submitForApproval(u, ctx, id);
  }

  @Post('periods/:id/approve')
  @HttpCode(200)
  @RequirePermissions('payroll.approve')
  approve(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.payroll.approveAndLock(u, ctx, id);
  }

  @Post('periods/:id/reject')
  @HttpCode(200)
  @RequirePermissions('payroll.approve')
  reject(
    @CurrentUser() u: AuthUser,
    @Audit() ctx: AuditContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectPayrollDto,
  ) {
    return this.payroll.rejectToDraft(u, ctx, id, dto.notes);
  }

  // ───────────── Slip Gaji ─────────────

  @Get('payslips/me')
  myPayslips(@CurrentUser() u: AuthUser) {
    return this.payroll.listMyPayslips(u);
  }

  @Get('payslips/:detailId')
  getPayslip(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Param('detailId', ParseUUIDPipe) detailId: string) {
    return this.payroll.getPayslip(u, ctx, detailId);
  }
}
