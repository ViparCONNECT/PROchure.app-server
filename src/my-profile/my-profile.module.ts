import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module';
import { RazorpayService } from '../payments/razorpay.service';
import { MyProfileController } from './my-profile.controller';
import { MyProfileService } from './my-profile.service';
import { RazorpayWebhookController } from './razorpay-webhook.controller';
import { PaymentLinksService } from './payment-links.service';
import { InvoiceService } from './invoice.service';
import {
  AdminPaymentLinksController,
  PublicPaymentLinksController,
} from './payment-links.controller';

@Module({
  imports: [ProfilesModule],
  providers: [MyProfileService, RazorpayService, PaymentLinksService, InvoiceService],
  controllers: [
    MyProfileController,
    RazorpayWebhookController,
    AdminPaymentLinksController,
    PublicPaymentLinksController,
  ],
})
export class MyProfileModule {}
