import { Controller, Get, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ApprovalsModule } from './approvals/approvals.module';
import { AttendanceModule } from './attendance/attendance.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard, PermissionsGuard } from './auth/guards';
import { Public } from './common/auth-context';
import { CryptoModule } from './common/crypto/crypto.module';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';
import { AppConfigModule } from './config/config.module';
import { EmployeesModule } from './employees/employees.module';
import { LeaveModule } from './leave/leave.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OrganizationModule } from './organization/organization.module';
import { OvertimeModule } from './overtime/overtime.module';
import { PrismaModule, PrismaService } from './prisma/prisma.service';
import { UsersModule } from './users/users.module';

@Controller('health')
class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    CryptoModule,
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    AuditModule,
    NotificationsModule,
    ApprovalsModule,
    AuthModule,
    UsersModule,
    OrganizationModule,
    EmployeesModule,
    AttendanceModule,
    LeaveModule,
    OvertimeModule,
  ],
  controllers: [HealthController],
  providers: [
    // Urutan eksekusi guard global: rate limit → autentikasi → otorisasi.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_GUARD, useExisting: PermissionsGuard },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}
