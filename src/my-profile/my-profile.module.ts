import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module';
import { RazorpayService } from '../payments/razorpay.service';
import { MyProfileController } from './my-profile.controller';
import { MyProfileService } from './my-profile.service';
import { RazorpayWebhookController } from './razorpay-webhook.controller';

@Module({
  imports: [ProfilesModule],
  providers: [MyProfileService, RazorpayService],
  controllers: [MyProfileController, RazorpayWebhookController],
})
export class MyProfileModule {}
