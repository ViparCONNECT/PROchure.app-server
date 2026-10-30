import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { MyProfileService } from './my-profile.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileDataService } from '../profiles/profile-data.service';
import { RazorpayService } from '../payments/razorpay.service';
import { InvoiceService } from './invoice.service';

const invoices = { assignNumber: jest.fn() };

const config: Record<string, unknown> = {
  RAZORPAY_KEY_ID: 'rzp_test_key',
  RAZORPAY_KEY_SECRET: 'secret123',
  RAZORPAY_WEBHOOK_SECRET: 'whsecret',
  PROFILE_FEE_INR: 1000,
};
const prisma = {
  user: { findUnique: jest.fn() },
  profile: {
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  payment: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
  $transaction: jest.fn(),
};
// Interactive transactions run the callback against the same mock client
const runTx = (cb: (tx: typeof prisma) => unknown) => cb(prisma);
const user = { id: 'u1', name: 'Asha', email: 'a@b.com', phone: '+919876543210', isActive: true };

describe('MyProfileService', () => {
  let service: MyProfileService;
  let razorpay: RazorpayService;
  const fetchMock = jest.fn();

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation(runTx);
    global.fetch = fetchMock as unknown as typeof fetch;
    const mod = await Test.createTestingModule({
      providers: [
        MyProfileService,
        RazorpayService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: (k: string) => config[k] } },
        { provide: InvoiceService, useValue: invoices },
        { provide: ProfileDataService, useValue: { toData: jest.fn(async () => ({ name: 'X' })) } },
      ],
    }).compile();
    service = mod.get(MyProfileService);
    razorpay = mod.get(RazorpayService);
    prisma.user.findUnique.mockResolvedValue(user);
  });

  it('create — saves the profile as PENDING_PAYMENT', async () => {
    prisma.profile.count.mockResolvedValue(0);
    await service.create('u1', {} as any);
    expect(prisma.profile.create.mock.calls[0][0].data).toMatchObject({
      userId: 'u1',
      status: 'PENDING_PAYMENT',
    });
  });

  it('create — one profile per user', async () => {
    prisma.profile.count.mockResolvedValue(1);
    await expect(service.create('u1', {} as any)).rejects.toThrow(ConflictException);
  });

  it('createPaymentOrder — creates a ₹1000 Razorpay order and records it', async () => {
    prisma.profile.findFirst.mockResolvedValue({ id: 'p1', status: 'PENDING_PAYMENT' });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'order_ABC', amount: 100000, currency: 'INR' }),
    });

    const res = await service.createPaymentOrder('u1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.razorpay.com/v1/orders');
    expect(JSON.parse(init.body)).toMatchObject({
      amount: 100000,
      currency: 'INR',
      receipt: 'profile_p1',
    });
    expect(init.headers.Authorization).toBe(
      `Basic ${Buffer.from('rzp_test_key:secret123').toString('base64')}`,
    );
    expect(prisma.payment.create.mock.calls[0][0].data).toMatchObject({
      razorpayOrderId: 'order_ABC',
      status: 'CREATED',
    });
    expect(res).toMatchObject({
      keyId: 'rzp_test_key',
      orderId: 'order_ABC',
      amount: 100000,
      prefill: { contact: user.phone },
    });
  });

  it('createPaymentOrder — refuses when the fee is already paid', async () => {
    prisma.profile.findFirst.mockResolvedValue({ id: 'p1', status: 'ACTIVE', paidAt: new Date() });
    await expect(service.createPaymentOrder('u1')).rejects.toThrow(ConflictException);
  });

  it('verifyPayment — rejects a forged signature', async () => {
    prisma.payment.findUnique.mockResolvedValue({ id: 'pay1', userId: 'u1', profileId: 'p1' });
    await expect(
      service.verifyPayment('u1', {
        razorpayOrderId: 'order_ABC',
        razorpayPaymentId: 'pay_X',
        razorpaySignature: 'bad',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.payment.updateMany).not.toHaveBeenCalled();
  });

  it('verifyPayment — valid signature marks paid, publishes and re-enables the profile', async () => {
    prisma.payment.findUnique.mockResolvedValue({ id: 'pay1', userId: 'u1', profileId: 'p1' });
    prisma.payment.updateMany.mockResolvedValue({ count: 1 });
    const signature = createHmac('sha256', 'secret123').update('order_ABC|pay_X').digest('hex');

    await service.verifyPayment('u1', {
      razorpayOrderId: 'order_ABC',
      razorpayPaymentId: 'pay_X',
      razorpaySignature: signature,
    });

    expect(prisma.payment.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'pay1', status: { not: 'PAID' } },
      data: { status: 'PAID', razorpayPaymentId: 'pay_X' },
    });
    expect(prisma.profile.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'p1', status: 'PENDING_PAYMENT' },
      data: { publishedAt: expect.any(Date) },
    });
    expect(prisma.profile.updateMany.mock.calls[1][0]).toMatchObject({
      where: { id: 'p1' },
      data: { status: 'ACTIVE', isDisabled: false, paidAt: expect.any(Date) },
    });
    expect(invoices.assignNumber).toHaveBeenCalledWith('pay1', expect.any(Date), prisma);
  });

  it('markPaid — a repeated notification (already PAID) does not touch the profile again', async () => {
    prisma.payment.findUnique.mockResolvedValue({ id: 'pay1', userId: 'u1', profileId: 'p1' });
    prisma.payment.updateMany.mockResolvedValue({ count: 0 });
    await service.markPaid('order_ABC', 'pay_X');
    expect(prisma.profile.updateMany).not.toHaveBeenCalled();
  });

  it('createOrderFor — works for an admin-created live profile that is not yet paid', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'order_L', amount: 100000, currency: 'INR' }),
    });
    const res = await service.createOrderFor({ id: 'p9', paidAt: null }, user);
    expect(res.orderId).toBe('order_L');
    expect(prisma.payment.create.mock.calls[0][0].data).toMatchObject({
      profileId: 'p9',
      userId: 'u1',
    });
  });

  it("verifyPayment — cannot verify another user's order", async () => {
    prisma.payment.findUnique.mockResolvedValue({ id: 'pay1', userId: 'someone-else' });
    await expect(
      service.verifyPayment('u1', {
        razorpayOrderId: 'order_ABC',
        razorpayPaymentId: 'pay_X',
        razorpaySignature: 'x',
      }),
    ).rejects.toThrow('Payment not found');
  });

  it('webhook signature check', () => {
    const body = Buffer.from('{"event":"payment.captured"}');
    const sig = createHmac('sha256', 'whsecret').update(body).digest('hex');
    expect(razorpay.isValidWebhookSignature(body, sig)).toBe(true);
    expect(razorpay.isValidWebhookSignature(body, 'nope')).toBe(false);
  });
});
