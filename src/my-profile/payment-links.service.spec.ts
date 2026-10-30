import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentLinksService } from './payment-links.service';
import { PrismaService } from '../prisma/prisma.service';
import { MyProfileService } from './my-profile.service';

const prisma = {
  profile: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  payment: { findUnique: jest.fn() },
};
const myProfile = {
  fee: { amount: 100000, currency: 'INR' },
  createOrderFor: jest.fn(),
  verifyAndMarkPaid: jest.fn(),
};
const config = {
  get: (k: string) => (k === 'PUBLIC_APP_URL' ? 'https://prochure.app/' : undefined),
};
const owner = { id: 'u1', name: 'Asha', email: 'a@b.com', phone: '+919876543210', isActive: true };

describe('PaymentLinksService', () => {
  let service: PaymentLinksService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new PaymentLinksService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
      myProfile as unknown as MyProfileService,
    );
  });

  it('getOrCreateLink — creates a token once and reuses it afterwards', async () => {
    prisma.profile.findUnique.mockResolvedValue({
      id: 'p1',
      userId: 'u1',
      paymentLinkToken: null,
      paidAt: null,
    });
    const first = await service.getOrCreateLink('p1');
    const token = prisma.profile.update.mock.calls[0][0].data.paymentLinkToken as string;
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(first.url).toBe(`https://prochure.app/pay/${token}`);

    prisma.profile.findUnique.mockResolvedValue({
      id: 'p1',
      userId: 'u1',
      paymentLinkToken: token,
      paidAt: null,
    });
    prisma.profile.update.mockClear();
    expect((await service.getOrCreateLink('p1')).url).toBe(first.url);
    expect(prisma.profile.update).not.toHaveBeenCalled();
  });

  it('getOrCreateLink — regenerate replaces the token (old link stops working)', async () => {
    prisma.profile.findUnique.mockResolvedValue({
      id: 'p1',
      userId: 'u1',
      paymentLinkToken: 'old-token-xxxxxxxxxxxx',
      paidAt: null,
    });
    const res = await service.getOrCreateLink('p1', true);
    expect(res.url).not.toContain('old-token');
  });

  it('getOrCreateLink — requires an owner login', async () => {
    prisma.profile.findUnique.mockResolvedValue({ id: 'p1', userId: null });
    await expect(service.getOrCreateLink('p1')).rejects.toThrow(ConflictException);
  });

  it('getByToken — unknown token is a 404; known token returns card, fee and paid flag', async () => {
    prisma.profile.findFirst.mockResolvedValueOnce(null);
    await expect(service.getByToken('nope')).rejects.toThrow(NotFoundException);

    prisma.profile.findFirst.mockResolvedValueOnce({
      id: 'p1',
      name: 'X',
      paidAt: null,
      user: { name: 'Asha' },
    });
    await expect(service.getByToken('tok')).resolves.toEqual({
      profile: { id: 'p1', name: 'X' },
      ownerName: 'Asha',
      fee: myProfile.fee,
      paid: false,
      paidAt: null,
    });
  });

  it('createOrder — creates an order for the profile owner (no login needed)', async () => {
    const profile = { id: 'p1', paidAt: null, user: owner };
    prisma.profile.findFirst.mockResolvedValue(profile);
    myProfile.createOrderFor.mockResolvedValue({ orderId: 'order_1' });
    await expect(service.createOrder('tok')).resolves.toEqual({ orderId: 'order_1' });
    expect(myProfile.createOrderFor).toHaveBeenCalledWith(profile, owner);
  });

  it('verify — rejects an order that belongs to a different profile', async () => {
    prisma.profile.findFirst.mockResolvedValue({ id: 'p1', paidAt: null, user: owner });
    prisma.payment.findUnique.mockResolvedValue({ profileId: 'other' });
    await expect(
      service.verify('tok', {
        razorpayOrderId: 'order_1',
        razorpayPaymentId: 'pay_1',
        razorpaySignature: 's',
      }),
    ).rejects.toThrow('Payment not found');
    expect(myProfile.verifyAndMarkPaid).not.toHaveBeenCalled();
  });
});
