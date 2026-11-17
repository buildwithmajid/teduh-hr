import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Audit, AuditContext, AuthUser, CurrentUser, RequirePermissions } from '../common/auth-context';
import { UsersService } from './users.service';

class CreateUserDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  /** Password awal; minta user menggantinya setelah login pertama. */
  @IsString()
  @MaxLength(128)
  password: string;

  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  roleIds: string[];

  @IsOptional()
  @IsUUID()
  employeeId?: string;
}

class SetRolesDto {
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  roleIds: string[];
}

class SetActiveDto {
  @IsBoolean()
  isActive: boolean;
}

@Controller()
@RequirePermissions('user.manage')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('roles')
  listRoles(@CurrentUser() user: AuthUser) {
    return this.users.listRoles(user.companyId);
  }

  @Get('users')
  list(@CurrentUser() user: AuthUser) {
    return this.users.list(user.companyId);
  }

  @Post('users')
  create(@CurrentUser() user: AuthUser, @Audit() ctx: AuditContext, @Body() dto: CreateUserDto) {
    return this.users.create(user, ctx, dto);
  }

  @Put('users/:id/roles')
  setRoles(
    @CurrentUser() user: AuthUser,
    @Audit() ctx: AuditContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRolesDto,
  ) {
    return this.users.setRoles(user, ctx, id, dto.roleIds);
  }

  @Patch('users/:id/status')
  setActive(
    @CurrentUser() user: AuthUser,
    @Audit() ctx: AuditContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetActiveDto,
  ) {
    return this.users.setActive(user, ctx, id, dto.isActive);
  }

  @Post('users/:id/reset-mfa')
  @HttpCode(204)
  async resetMfa(@CurrentUser() user: AuthUser, @Audit() ctx: AuditContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.users.resetMfa(user, ctx, id);
  }
}
