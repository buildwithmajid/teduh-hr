import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthzService } from './authz.service';
import { JwtAuthGuard, PermissionsGuard } from './guards';
import { TokenService } from './token.service';

@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  // Guard global (throttle → JWT → permission) didaftarkan berurutan di AppModule.
  providers: [AuthService, AuthzService, TokenService, JwtAuthGuard, PermissionsGuard],
  exports: [AuthzService, TokenService, JwtAuthGuard, PermissionsGuard],
})
export class AuthModule {}
