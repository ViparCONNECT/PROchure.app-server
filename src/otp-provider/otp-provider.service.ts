import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const WIDGET_API = 'https://control.msg91.com/api/v5/widget';

interface WidgetResponse {
  type?: string;
  message?: string;
  reqId?: string;
  code?: string | number;
}

/**
 * Sends and verifies OTPs through an MSG91 OTP Widget (channel — e.g. WhatsApp — is configured in the widget).
 * When the widget isn't configured outside production, `isEnabled` is false and the caller handles OTPs locally (dev mode).
 */
@Injectable()
export class OtpProviderService {
  private readonly logger = new Logger(OtpProviderService.name);

  constructor(private readonly config: ConfigService) {}

  get isEnabled(): boolean {
    const configured = !!this.widgetId && !!this.tokenAuth;
    if (!configured && this.config.get<string>('NODE_ENV') === 'production') {
      this.logger.error('MSG91_OTP_WIDGET_ID / MSG91_OTP_TOKEN_AUTH are not configured');
      throw new ServiceUnavailableException('OTP service is not configured');
    }
    return configured;
  }

  /** Sends an OTP to an E.164 phone number. Returns MSG91's request id, needed to verify. */
  async sendOtp(phone: string): Promise<string> {
    const res = await this.call('sendOtp', { identifier: phone.replace(/^\+/, '') });
    const reqId = res.reqId ?? res.message;
    if (res.type !== 'success' || !reqId) {
      this.logger.error(`MSG91 sendOtp failed: ${JSON.stringify(res)}`);
      throw new ServiceUnavailableException('Could not send OTP on WhatsApp. Please try again.');
    }
    return reqId;
  }

  /** True if MSG91 accepts the OTP for this request id. */
  async verifyOtp(reqId: string, otp: string): Promise<boolean> {
    const res = await this.call('verifyOtp', { reqId, otp });
    if (res.type === 'success') return true;
    this.logger.warn(`MSG91 verifyOtp rejected: ${res.message ?? JSON.stringify(res)}`);
    return false;
  }

  private get widgetId() {
    return this.config.get<string>('MSG91_OTP_WIDGET_ID');
  }

  private get tokenAuth() {
    return this.config.get<string>('MSG91_OTP_TOKEN_AUTH');
  }

  private async call(
    path: 'sendOtp' | 'verifyOtp',
    body: Record<string, string>,
  ): Promise<WidgetResponse> {
    try {
      const res = await fetch(`${WIDGET_API}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ widgetId: this.widgetId, tokenAuth: this.tokenAuth, ...body }),
        signal: AbortSignal.timeout(10000),
      });
      const json = (await res.json().catch(() => ({}))) as WidgetResponse;
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(json)}`);
      return json;
    } catch (err) {
      const cause = (err as { cause?: { code?: string; message?: string } })?.cause;
      const reason = [err instanceof Error ? err.message : String(err), cause?.code ?? cause?.message]
        .filter(Boolean)
        .join(' — ');
      this.logger.error(
        `MSG91 ${path} request failed: ${reason}` +
          (cause?.code === 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY'
            ? ' (HTTPS is being intercepted by a corporate proxy; set NODE_EXTRA_CA_CERTS to its root CA)'
            : ''),
      );
      throw new ServiceUnavailableException('OTP service is unavailable. Please try again.');
    }
  }
}
