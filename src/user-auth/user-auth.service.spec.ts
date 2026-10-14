import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OtpPurpose } from '@prisma/client';
import { UserAuthService } from './user-auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { OtpProviderService } from '../otp-provider/otp-provider.service';

const mockPrisma = {
  user: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  userRefreshToken: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
  otpCode: {
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    updateMany: jest.fn(),
  },
};
const mockProvider = { isEnabled: true, sendOtp: jest.fn(), verifyOtp: jest.fn() };
const config: Record<string, unknown> = {
  USER_JWT_ACCESS_SECRET: 'a'.repeat(32),
  USER_JWT_REFRESH_SECRET: 'b'.repeat(32),
};
const mockConfig = {
  get: (k: string) => config[k],
  getOrThrow: (k: string) => config[k],
};

const phone = '+919876543210';
const later = () => new Date(Date.now() + 60000);

describe('UserAuthService', () => {
  let service: UserAuthService;

  beforeEach(async () => {
    jest.resetAllMocks();
    mockProvider.isEnabled = true;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserAuthService,
        JwtService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: OtpProviderService, useValue: mockProvider },
      ],
    }).compile();
    service = module.get(UserAuthService);
    mockPrisma.otpCode.count.mockResolvedValue(0);
    mockPrisma.otpCode.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.otpCode.create.mockImplementation(({ data }) => ({
      id: 'otp1',
      attempts: 0,
      ...data,
    }));
    mockProvider.sendOtp.mockResolvedValue('req-123');
  });

  /** Sends a registration OTP through the (mocked) MSG91 widget and returns the stored record. */
  async function sendRegister(): Promise<any> {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.otpCode.findFirst.mockResolvedValue(null);
    await service.sendRegisterOtp({ name: 'Asha', email: 'asha@example.com', phone });
    const record = await mockPrisma.otpCode.create.mock.results[0].value;
    mockPrisma.otpCode.findFirst.mockResolvedValue({ ...record, expiresAt: later() });
    return record;
  }

  it('sendRegisterOtp — rejects an already registered email', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      email: 'asha@example.com',
      phone: '+910000000000',
    });
    await expect(
      service.sendRegisterOtp({ name: 'Asha', email: 'asha@example.com', phone }),
    ).rejects.toThrow(ConflictException);
    expect(mockProvider.sendOtp).not.toHaveBeenCalled();
  });

  it('sendRegisterOtp — sends via MSG91, stores its reqId and masks the phone', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.otpCode.findFirst.mockResolvedValue(null);
    const res = await service.sendRegisterOtp({ name: 'Asha', email: 'asha@example.com', phone });

    expect(mockProvider.sendOtp).toHaveBeenCalledWith(phone);
    expect(mockPrisma.otpCode.create.mock.calls[0][0].data).toMatchObject({
      phone,
      purpose: OtpPurpose.REGISTER,
      reqId: 'req-123',
      codeHash: null,
      name: 'Asha',
      email: 'asha@example.com',
    });
    expect(res.maskedPhone).toBe('+91******3210');
  });

  it('sendRegisterOtp — enforces resend cooldown', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.otpCode.findFirst.mockResolvedValue({ createdAt: new Date() });
    await expect(
      service.sendRegisterOtp({ name: 'Asha', email: 'a@b.com', phone }),
    ).rejects.toThrow(HttpException);
    expect(mockProvider.sendOtp).not.toHaveBeenCalled();
  });

  it('sendRegisterOtp — stores nothing (and keeps the previous OTP valid) if MSG91 fails', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.otpCode.findFirst.mockResolvedValue(null);
    mockProvider.sendOtp.mockRejectedValue(new ServiceUnavailableException('down'));
    await expect(
      service.sendRegisterOtp({ name: 'Asha', email: 'a@b.com', phone }),
    ).rejects.toThrow('down');
    expect(mockPrisma.otpCode.create).not.toHaveBeenCalled();
    expect(mockPrisma.otpCode.updateMany).not.toHaveBeenCalled();
  });

  it('verifyRegisterOtp — verifies with MSG91, creates the user and issues tokens', async () => {
    await sendRegister();
    mockProvider.verifyOtp.mockResolvedValue(true);
    mockPrisma.user.create.mockResolvedValue({
      id: 'u1',
      name: 'Asha',
      email: 'asha@example.com',
      phone,
    });

    const session = await service.verifyRegisterOtp({ phone, otp: '4321' });

    expect(mockProvider.verifyOtp).toHaveBeenCalledWith('req-123', '4321');
    expect(session.accessToken).toBeTruthy();
    expect(session.user).toEqual({ id: 'u1', name: 'Asha', email: 'asha@example.com', phone });
  });

  it('verifyRegisterOtp — rejects an OTP MSG91 does not accept and reports attempts left', async () => {
    await sendRegister();
    mockProvider.verifyOtp.mockResolvedValue(false);
    await expect(service.verifyRegisterOtp({ phone, otp: '0000' })).rejects.toThrow(
      'Incorrect OTP. 4 attempt(s) left.',
    );
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it('verifyRegisterOtp — does not call MSG91 once attempts are exhausted', async () => {
    await sendRegister();
    mockPrisma.otpCode.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.verifyRegisterOtp({ phone, otp: '1234' })).rejects.toThrow(
      BadRequestException,
    );
    expect(mockProvider.verifyOtp).not.toHaveBeenCalled();
  });

  it('verifyRegisterOtp — rejects an expired OTP without calling MSG91', async () => {
    const record = await sendRegister();
    mockPrisma.otpCode.findFirst.mockResolvedValue({
      ...record,
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(service.verifyRegisterOtp({ phone, otp: '1234' })).rejects.toThrow(
      'OTP has expired',
    );
    expect(mockProvider.verifyOtp).not.toHaveBeenCalled();
  });

  it('dev mode (widget not configured) — local OTP logged to console and verified locally', async () => {
    mockProvider.isEnabled = false;
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await sendRegister();
    const code = String(warn.mock.calls.at(-1)?.[0]).match(/(\d{6})$/)?.[1];
    expect(code).toBeDefined();
    expect(mockProvider.sendOtp).not.toHaveBeenCalled();
    mockPrisma.user.create.mockResolvedValue({
      id: 'u1',
      name: 'Asha',
      email: 'asha@example.com',
      phone,
    });

    await expect(service.verifyRegisterOtp({ phone, otp: code! })).resolves.toHaveProperty(
      'accessToken',
    );
    expect(mockProvider.verifyOtp).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('sendLoginOtp — 404 for unknown account', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expect(service.sendLoginOtp({ identifier: 'nobody@example.com' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('sendLoginOtp — sends OTP to the registered phone when identified by email', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', phone, isActive: true });
    mockPrisma.otpCode.findFirst.mockResolvedValue(null);
    const res = await service.sendLoginOtp({ identifier: 'Asha@Example.com' });
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'asha@example.com' },
    });
    expect(mockProvider.sendOtp).toHaveBeenCalledWith(phone);
    expect(res.maskedPhone).toBe('+91******3210');
  });

  it('sendLoginOtp — rejects a phone identifier without country code', async () => {
    await expect(service.sendLoginOtp({ identifier: '9876543210' })).rejects.toThrow(
      BadRequestException,
    );
  });
});
