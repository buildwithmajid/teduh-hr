import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Audit, AuditContext, AuthUser, CurrentUser, RequirePermissions } from '../common/auth-context';
import {
  CreateCompanyDto,
  CreateDepartmentDto,
  CreatePositionDto,
  CreateWorkLocationDto,
  UpdateCompanyDto,
  UpdateCompanySettingsDto,
  UpdateDepartmentDto,
  UpdatePositionDto,
  UpdateWorkLocationDto,
} from './organization.dto';
import { OrganizationService } from './organization.service';

@Controller()
export class OrganizationController {
  constructor(private readonly org: OrganizationService) {}

  // Company
  @Get('companies/current')
  getCompany(@CurrentUser() u: AuthUser) {
    return this.org.getCompany(u.companyId);
  }

  @Patch('companies/current')
  @RequirePermissions('company.manage')
  updateCompany(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Body() dto: UpdateCompanyDto) {
    return this.org.updateCompany(u.companyId, ctx, dto);
  }

  @Post('companies')
  @RequirePermissions('company.create')
  createCompany(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Body() dto: CreateCompanyDto) {
    return this.org.createCompany(u, ctx, dto);
  }

  @Get('company-settings')
  @RequirePermissions('settings.manage')
  getSettings(@CurrentUser() u: AuthUser) {
    return this.org.getSettings(u.companyId);
  }

  @Patch('company-settings')
  @RequirePermissions('settings.manage')
  updateSettings(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Body() dto: UpdateCompanySettingsDto) {
    return this.org.updateSettings(u.companyId, ctx, dto);
  }

  // Departments
  @Get('departments')
  @RequirePermissions('department.view')
  listDepartments(@CurrentUser() u: AuthUser) {
    return this.org.listDepartments(u.companyId);
  }

  @Post('departments')
  @RequirePermissions('department.manage')
  createDepartment(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Body() dto: CreateDepartmentDto) {
    return this.org.createDepartment(u.companyId, ctx, dto);
  }

  @Patch('departments/:id')
  @RequirePermissions('department.manage')
  updateDepartment(
    @CurrentUser() u: AuthUser,
    @Audit() ctx: AuditContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.org.updateDepartment(u.companyId, ctx, id, dto);
  }

  @Delete('departments/:id')
  @HttpCode(204)
  @RequirePermissions('department.manage')
  async deleteDepartment(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.org.deleteDepartment(u.companyId, ctx, id);
  }

  // Positions
  @Get('positions')
  @RequirePermissions('department.view')
  listPositions(@CurrentUser() u: AuthUser, @Query('departmentId', new ParseUUIDPipe({ optional: true })) departmentId?: string) {
    return this.org.listPositions(u.companyId, departmentId);
  }

  @Post('positions')
  @RequirePermissions('position.manage')
  createPosition(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Body() dto: CreatePositionDto) {
    return this.org.createPosition(u.companyId, ctx, dto);
  }

  @Patch('positions/:id')
  @RequirePermissions('position.manage')
  updatePosition(
    @CurrentUser() u: AuthUser,
    @Audit() ctx: AuditContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePositionDto,
  ) {
    return this.org.updatePosition(u.companyId, ctx, id, dto);
  }

  @Delete('positions/:id')
  @HttpCode(204)
  @RequirePermissions('position.manage')
  async deletePosition(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.org.deletePosition(u.companyId, ctx, id);
  }

  // Work locations
  @Get('work-locations')
  @RequirePermissions('location.view')
  listWorkLocations(@CurrentUser() u: AuthUser) {
    return this.org.listWorkLocations(u.companyId);
  }

  @Post('work-locations')
  @RequirePermissions('location.manage')
  createWorkLocation(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Body() dto: CreateWorkLocationDto) {
    return this.org.createWorkLocation(u.companyId, ctx, dto);
  }

  @Patch('work-locations/:id')
  @RequirePermissions('location.manage')
  updateWorkLocation(
    @CurrentUser() u: AuthUser,
    @Audit() ctx: AuditContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkLocationDto,
  ) {
    return this.org.updateWorkLocation(u.companyId, ctx, id, dto);
  }

  @Delete('work-locations/:id')
  @HttpCode(204)
  @RequirePermissions('location.manage')
  async deleteWorkLocation(@CurrentUser() u: AuthUser, @Audit() ctx: AuditContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.org.deleteWorkLocation(u.companyId, ctx, id);
  }
}
