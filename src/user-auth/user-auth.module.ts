import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { OtpProviderModule } from '../otp-provider/otp-provider.module';
import { UserAuthController } from './user-auth.controller';
import { UserAuthService } from './user-auth.service';
import { UserJwtStrategy } from './strategies/user-jwt.strategy';
import { UserJwtRefreshStrategy } from './strategies/user-jwt-refresh.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({}), OtpProviderModule],
  providers: [UserAuthService, UserJwtStrategy, UserJwtRefreshStrategy],
  controllers: [UserAuthController],
  exports: [UserAuthService],
})
export class UserAuthModule {}
