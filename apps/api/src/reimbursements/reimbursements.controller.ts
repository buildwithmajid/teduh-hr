import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ReimbursementCategory, RequestStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApprovalDecisionDto } from '../attendance/attendance.dto';
import { Audit, AuditContext, AuthUser, CurrentUser, RequirePermissions } from '../common/auth-context';
import { ReimbursementsService } from './reimbursements.service';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

class CreateReimbursementDto {
  @IsEnum(ReimbursementCategory)
  category: ReimbursementCategory;

  @IsString()
  @MinLength(3)
  @MaxLength(150)
  title: string;

  @Matches(DATE_RE)
  expenseDate: string;

  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(500_000_000)
  amount: number;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  description: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  receiptRef?: string;
}

@Controller('reimbursements')
export class ReimbursementsController {
  constructor(private readonly reimbursements: ReimbursementsService) {}

  @Post()
  create(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Body() dto: CreateReimbursementDto) {
    return this.reimbursements.create(u, ctx, dto);
  }

  @Get('me')
  listMine(@CurrentUser() u: AuthUser) {
    return this.reimbursements.listMine(u);
  }

  @Get()
  @RequirePermissions('reimbursement.view')
  listCompany(@CurrentUser() u: AuthUser, @Query('status') status?: RequestStatus) {
    return this.reimbursements.listCompany(u.companyId, status);
  }

  @Post(':id/approve')
  @HttpCode(200)
  approve(
    @CurrentUser() u: AuthUser,
    @Audit() ctx: AuditContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovalDecisionDto,
  ) {
    return this.reimbursements.decide(u, ctx, id, 'approved', dto.notes);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(
    @CurrentUser() u: AuthUser,
    @Audit() ctx: AuditContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovalDecisionDto,
  ) {
    return this.reimbursements.decide(u, ctx, id, 'rejected', dto.notes);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.reimbursements.cancel(u, ctx, id);
  }
}
