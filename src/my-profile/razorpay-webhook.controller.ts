import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request } from 'express';
import { RazorpayService } from '../payments/razorpay.service';
import { MyProfileService } from './my-profile.service';

interface RazorpayWebhookEvent {
  event: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string } };
    order?: { entity?: { id?: string } };
  };
}

/** Backup to the checkout callback: publishes the profile even if the user closes the tab after paying. */
@ApiExcludeController()
@Controller({ path: 'payments/razorpay', version: '1' })
export class RazorpayWebhookController {
  constructor(
    private readonly razorpay: RazorpayService,
    private readonly myProfile: MyProfileService,
  ) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature: string,
  ) {
    if (!req.rawBody || !this.razorpay.isValidWebhookSignature(req.rawBody, signature)) {
      throw new UnauthorizedException('Invalid signature');
    }

    const { event, payload } = req.body as RazorpayWebhookEvent;
    const payment = payload?.payment?.entity;
    const orderId = payment?.order_id ?? payload?.order?.entity?.id;

    if ((event === 'payment.captured' || event === 'order.paid') && orderId && payment?.id) {
      await this.myProfile.markPaid(orderId, payment.id);
    } else if (event === 'payment.failed' && orderId) {
      await this.myProfile.markFailed(orderId);
    }
    return { received: true };
  }
}
