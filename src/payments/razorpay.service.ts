import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

const RAZORPAY_ORDERS_URL = 'https://api.razorpay.com/v1/orders';

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
}

@Injectable()
export class RazorpayService {
  private readonly logger = new Logger(RazorpayService.name);

  constructor(private readonly config: ConfigService) {}

  get keyId(): string {
    return this.credentials().keyId;
  }

  async createOrder(
    amount: number,
    currency: string,
    receipt: string,
    notes: Record<string, string>,
  ): Promise<RazorpayOrder> {
    const { keyId, keySecret } = this.credentials();
    try {
      const res = await fetch(RAZORPAY_ORDERS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
        },
        body: JSON.stringify({ amount, currency, receipt, notes }),
        signal: AbortSignal.timeout(10000),
      });
      const body = (await res.json()) as RazorpayOrder & { error?: { description?: string } };
      if (!res.ok)
        throw new Error(`Razorpay ${res.status}: ${body.error?.description ?? 'unknown error'}`);
      return body;
    } catch (err) {
      this.logger.error(
        'Failed to create Razorpay order',
        err instanceof Error ? err.message : String(err),
      );
      throw new ServiceUnavailableException('Could not start the payment. Please try again.');
    }
  }

  /** Signature returned to Checkout's success handler: HMAC_SHA256(order_id|payment_id, key_secret). */
  isValidPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
    return this.safeEqual(
      this.hmac(this.credentials().keySecret, `${orderId}|${paymentId}`),
      signature,
    );
  }

  /** X-Razorpay-Signature header on webhooks: HMAC_SHA256(raw body, webhook secret). */
  isValidWebhookSignature(rawBody: Buffer, signature: string): boolean {
    const secret = this.config.get<string>('RAZORPAY_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.warn('Received a Razorpay webhook but RAZORPAY_WEBHOOK_SECRET is not configured');
      return false;
    }
    return this.safeEqual(this.hmac(secret, rawBody), signature);
  }

  private credentials() {
    const keyId = this.config.get<string>('RAZORPAY_KEY_ID');
    const keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET');
    if (!keyId || !keySecret) {
      this.logger.error('RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not configured');
      throw new ServiceUnavailableException('Payments are not configured. Please contact support.');
    }
    return { keyId, keySecret };
  }

  private hmac(secret: string, data: string | Buffer): string {
    return createHmac('sha256', secret).update(data).digest('hex');
  }

  private safeEqual(expectedHex: string, actual: string): boolean {
    const a = Buffer.from(expectedHex);
    const b = Buffer.from(actual ?? '');
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
