import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import type { Request, Response } from 'express';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { Audit, AuditContext, AuthUser, CurrentUser, Public } from '../common/auth-context';
import { AuthService } from './auth.service';
import { SessionTokens, TokenService } from './token.service';

export const REFRESH_COOKIE = 'hris_rt';
const REFRESH_COOKIE_PATH = '/api/auth';

class LoginDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @MaxLength(128)
  password: string;

  @IsOptional()
  @IsUUID()
  companyId?: string;
}

class MfaTokenDto {
  @IsString()
  mfaToken: string;
}

class MfaCodeDto extends MfaTokenDto {
  @IsString()
  @Length(6, 6)
  code: string;
}

class ChangePasswordDto {
  @IsString()
  @MaxLength(128)
  currentPassword: string;

  @IsString()
  @MaxLength(128)
  newPassword: string;
}

const LOGIN_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle(LOGIN_THROTTLE)
  async login(@Body() dto: LoginDto, @Audit() ctx: AuditContext, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto.email, dto.password, dto.companyId, ctx);
    if (result.status === 'ok') return this.sendSession(res, result.session);
    return result;
  }

  @Public()
  @Post('mfa/setup')
  @HttpCode(200)
  @Throttle(LOGIN_THROTTLE)
  setupMfa(@Body() dto: MfaTokenDto) {
    return this.auth.setupMfa(dto.mfaToken);
  }

  @Public()
  @Post('mfa/enable')
  @HttpCode(200)
  @Throttle(LOGIN_THROTTLE)
  async enableMfa(@Body() dto: MfaCodeDto, @Audit() ctx: AuditContext, @Res({ passthrough: true }) res: Response) {
    return this.sendSession(res, await this.auth.enableMfa(dto.mfaToken, dto.code, ctx));
  }

  @Public()
  @Post('mfa/verify')
  @HttpCode(200)
  @Throttle(LOGIN_THROTTLE)
  async verifyMfa(@Body() dto: MfaCodeDto, @Audit() ctx: AuditContext, @Res({ passthrough: true }) res: Response) {
    return this.sendSession(res, await this.auth.verifyMfa(dto.mfaToken, dto.code, ctx));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Audit() ctx: AuditContext, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token) throw new UnauthorizedException('Sesi tidak ditemukan');
    try {
      return this.sendSession(res, await this.tokens.rotate(token, ctx));
    } catch (err) {
      this.clearCookie(res);
      throw err;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (token) await this.tokens.revokeByToken(token);
    this.clearCookie(res);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.userId, user.companyId);
  }

  @Post('change-password')
  @HttpCode(204)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Audit() ctx: AuditContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.changePassword(user.userId, dto.currentPassword, dto.newPassword, ctx);
    this.clearCookie(res);
  }

  /** Refresh token hanya dikirim lewat cookie httpOnly; body hanya berisi access token. */
  private sendSession(res: Response, session: SessionTokens) {
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      httpOnly: true,
      secure: this.config.isProduction,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      expires: session.refreshExpiresAt,
    });
    return { status: 'ok' as const, accessToken: session.accessToken, expiresIn: session.expiresIn };
  }

  private clearCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  }
}
