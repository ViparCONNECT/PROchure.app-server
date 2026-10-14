import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpProviderService } from './otp-provider.service';

const make = (env: Record<string, string>) =>
  new OtpProviderService({ get: (k: string) => env[k] } as unknown as ConfigService);

describe('OtpProviderService (MSG91 OTP widget)', () => {
  const fetchMock = jest.fn();
  const configured = { MSG91_OTP_WIDGET_ID: 'widget-1', MSG91_OTP_TOKEN_AUTH: 'token-1' };
  const reply = (body: object, ok = true) =>
    fetchMock.mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body });

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('is disabled in dev when not configured, but fails loudly in production', () => {
    expect(make({}).isEnabled).toBe(false);
    expect(() => make({ NODE_ENV: 'production' }).isEnabled).toThrow(ServiceUnavailableException);
    expect(make(configured).isEnabled).toBe(true);
  });

  it('sendOtp — posts widgetId, tokenAuth and the number without "+", returns reqId', async () => {
    reply({ type: 'success', message: 'req-abc' });
    await expect(make(configured).sendOtp('+919876543210')).resolves.toBe('req-abc');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://control.msg91.com/api/v5/widget/sendOtp');
    expect(JSON.parse(init.body)).toEqual({
      widgetId: 'widget-1',
      tokenAuth: 'token-1',
      identifier: '919876543210',
    });
  });

  it('sendOtp — MSG91 error payload (even with HTTP 200) becomes a 503', async () => {
    reply({ type: 'error', message: 'AuthenticationFailure', code: '201' });
    await expect(make(configured).sendOtp('+919876543210')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('verifyOtp — true on success, false on rejection, 503 on network/HTTP failure', async () => {
    const svc = make(configured);
    reply({ type: 'success', message: 'jwt' });
    await expect(svc.verifyOtp('req-abc', '1234')).resolves.toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      reqId: 'req-abc',
      otp: '1234',
    });

    reply({ type: 'error', message: 'OTP not match' });
    await expect(svc.verifyOtp('req-abc', '0000')).resolves.toBe(false);

    reply({}, false);
    await expect(svc.verifyOtp('req-abc', '1234')).rejects.toThrow(ServiceUnavailableException);
  });
});
