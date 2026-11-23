import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApprovalRequestType, ApproverType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
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
  ValidateNested,
} from 'class-validator';
import { Audit, AuditContext, AuthUser, CurrentUser, RequirePermissions } from '../common/auth-context';
import { ApprovalsService } from './approvals.service';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

class WorkflowStepDto {
  @IsEnum(ApproverType)
  approverType: ApproverType;

  @IsOptional()
  @IsUUID()
  approverRoleId?: string | null;

  @IsOptional()
  @IsUUID()
  fallbackRoleId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  escalateAfterHours?: number | null;
}

class SaveWorkflowDto {
  @IsEnum(ApprovalRequestType)
  requestType: ApprovalRequestType;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  steps: WorkflowStepDto[];
}

class CreateDelegationDto {
  @IsUUID()
  delegateId: string;

  @Matches(DATE_RE)
  startDate: string;

  @Matches(DATE_RE)
  endDate: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requestTypes?: string[];
}

@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get('pending')
  pending(@CurrentUser() u: AuthUser) {
    return this.approvals.listPendingForUser(u);
  }

  @Get('workflows')
  @RequirePermissions('approval.manage')
  listWorkflows(@CurrentUser() u: AuthUser) {
    return this.approvals.listWorkflows(u.companyId);
  }

  @Put('workflows')
  @RequirePermissions('approval.manage')
  saveWorkflow(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Body() dto: SaveWorkflowDto) {
    return this.approvals.saveWorkflow(u.companyId, ctx, dto);
  }

  @Get('delegations')
  listDelegations(@CurrentUser() u: AuthUser) {
    return this.approvals.listDelegations(u);
  }

  @Post('delegations')
  createDelegation(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Body() dto: CreateDelegationDto) {
    return this.approvals.createDelegation(u, ctx, dto);
  }

  @Delete('delegations/:id')
  @HttpCode(204)
  deleteDelegation(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.approvals.deleteDelegation(u, ctx, id);
  }
}
