import { Controller, Get, Query } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser, RequirePermissions } from '../common/auth-context';
import { paginate, PaginationQuery } from '../common/validation';
import { AuditService } from './audit.service';

class AuditQuery extends PaginationQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  tableName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  recordId?: string;
}

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('audit.view')
  async list(@CurrentUser() user: AuthUser, @Query() q: AuditQuery) {
    const { items, total } = await this.audit.list(user.companyId, {
      tableName: q.tableName,
      recordId: q.recordId,
      ...paginate(q),
    });
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  /** Rantai hash bersifat global (lintas perusahaan), jadi hanya untuk pemegang audit.verify. */
  @Get('verify')
  @RequirePermissions('audit.verify')
  verify() {
    return this.audit.verifyChain();
  }
}
