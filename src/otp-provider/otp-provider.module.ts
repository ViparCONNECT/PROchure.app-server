import { Module } from '@nestjs/common';
import { OtpProviderService } from './otp-provider.service';

@Module({
  providers: [OtpProviderService],
  exports: [OtpProviderService],
})
export class OtpProviderModule {}
