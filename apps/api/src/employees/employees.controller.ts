import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Audit, AuditContext, AuthUser, CurrentUser, RequirePermissions } from '../common/auth-context';
import {
  AssignSalaryComponentDto,
  CreateEmployeeDto,
  CreateSalaryComponentDto,
  EndSalaryComponentDto,
  ListEmployeesQuery,
  SalaryChangeDto,
  TerminateEmployeeDto,
  UpdateEmployeeDto,
  UpdateSalaryComponentDto,
  UpdateSensitiveDto,
} from './employees.dto';
import { EmployeesService } from './employees.service';
import { SalaryComponentsService } from './salary-components.service';

@Controller('employees')
export class EmployeesController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly components: SalaryComponentsService,
  ) {}

  /** Profil sendiri, termasuk data sensitif milik sendiri. Tidak butuh permission khusus. */
  @Get('me')
  me(@CurrentUser() u: AuthUser) {
    return this.employees.getMe(u);
  }

  @Get('team')
  @RequirePermissions('employee.view_team')
  team(@CurrentUser() u: AuthUser) {
    return this.employees.listTeam(u);
  }

  @Get()
  @RequirePermissions('employee.view')
  list(@CurrentUser() u: AuthUser, @Query() q: ListEmployeesQuery) {
    return this.employees.list(u.companyId, q);
  }

  @Post()
  @RequirePermissions('employee.manage', 'salary.manage')
  create(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Body() dto: CreateEmployeeDto) {
    return this.employees.create(u, ctx, dto);
  }

  @Get(':id')
  @RequirePermissions('employee.view')
  get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.employees.getSummary(u.companyId, id);
  }

  @Get(':id/sensitive')
  @RequirePermissions('employee.view_sensitive')
  getSensitive(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.employees.getSensitive(u, ctx, id);
  }

  @Get(':id/history')
  @RequirePermissions('employee.view_sensitive')
  history(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.employees.getHistory(u, ctx, id);
  }

  @Patch(':id')
  @RequirePermissions('employee.manage')
  update(
    @CurrentUser() u: AuthUser,
    @Audit() ctx: AuditContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employees.update(u, ctx, id, dto);
  }

  @Patch(':id/sensitive')
  @RequirePermissions('employee.manage_sensitive')
  updateSensitive(
    @CurrentUser() u: AuthUser,
    @Audit() ctx: AuditContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSensitiveDto,
  ) {
    return this.employees.updateSensitive(u, ctx, id, dto);
  }

  @Post(':id/salary-changes')
  @RequirePermissions('salary.manage')
  changeSalary(
    @CurrentUser() u: AuthUser,
    @Audit() ctx: AuditContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SalaryChangeDto,
  ) {
    return this.employees.changeSalary(u, ctx, id, dto);
  }

  @Post(':id/terminate')
  @RequirePermissions('employee.manage')
  terminate(
    @CurrentUser() u: AuthUser,
    @Audit() ctx: AuditContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TerminateEmployeeDto,
  ) {
    return this.employees.terminate(u, ctx, id, dto);
  }

  @Get(':id/salary-components')
  @RequirePermissions('employee.view_sensitive')
  listComponents(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.components.listForEmployee(u, ctx, id);
  }

  @Post(':id/salary-components')
  @RequirePermissions('salary.manage')
  assignComponent(
    @CurrentUser() u: AuthUser,
    @Audit() ctx: AuditContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignSalaryComponentDto,
  ) {
    return this.components.assign(u, ctx, id, dto);
  }

  @Post(':id/salary-components/:assignmentId/end')
  @RequirePermissions('salary.manage')
  endComponent(
    @CurrentUser() u: AuthUser,
    @Audit() ctx: AuditContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() dto: EndSalaryComponentDto,
  ) {
    return this.components.end(u, ctx, id, assignmentId, dto.effectiveTo);
  }
}

@Controller('salary-components')
export class SalaryComponentsController {
  constructor(private readonly components: SalaryComponentsService) {}

  @Get()
  @RequirePermissions('salary.view')
  list(@CurrentUser() u: AuthUser) {
    return this.components.list(u.companyId);
  }

  @Post()
  @RequirePermissions('salary.manage')
  create(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Body() dto: CreateSalaryComponentDto) {
    return this.components.create(u.companyId, ctx, dto);
  }

  @Patch(':id')
  @RequirePermissions('salary.manage')
  update(
    @CurrentUser() u: AuthUser,
    @Audit() ctx: AuditContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSalaryComponentDto,
  ) {
    return this.components.update(u.companyId, ctx, id, dto);
  }
}
