import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentStatus, Prisma, ProfileStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileContentDto } from '../profiles/dto/profile-content.dto';
import { PROFILE_INCLUDE, ProfileDataService } from '../profiles/profile-data.service';
import { RazorpayService } from '../payments/razorpay.service';
import { VerifyPaymentDto } from './dto/verify-payment.dto';

const CURRENCY = 'INR';

const OWN_PROFILE_SELECT = {
  id: true,
  status: true,
  isDisabled: true,
  categoryId: true,
  subCategoryId: true,
  consultantKind: true,
  name: true,
  consultantName: true,
  degrees: true,
  registrationNumber: true,
  servicesOffered: true,
  sinceYear: true,
  isWomenEntrepreneur: true,
  contactNumbers: true,
  emails: true,
  address: true,
  workingHours: true,
  languages: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  ...PROFILE_INCLUDE,
} satisfies Prisma.ProfileSelect;

@Injectable()
export class MyProfileService {
  private readonly logger = new Logger(MyProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly profileData: ProfileDataService,
    private readonly razorpay: RazorpayService,
  ) {}

  private get feePaise(): number {
    return (this.config.get<number>('PROFILE_FEE_INR') ?? 1000) * 100;
  }

  async get(userId: string) {
    await this.requireUser(userId);
    const profile = await this.prisma.profile.findFirst({
      where: { userId },
      select: OWN_PROFILE_SELECT,
    });
    return { profile, fee: { amount: this.feePaise, currency: CURRENCY } };
  }

  async create(userId: string, dto: ProfileContentDto) {
    await this.requireUser(userId);
    if (await this.prisma.profile.count({ where: { userId } })) {
      throw new ConflictException('You already have a profile. You can edit it from "My Profile".');
    }
    const data = await this.profileData.toData(dto);
    return this.prisma.profile.create({
      data: { ...data, userId, status: ProfileStatus.PENDING_PAYMENT },
      select: OWN_PROFILE_SELECT,
    });
  }

  async update(userId: string, dto: ProfileContentDto) {
    const profile = await this.requireProfile(userId);
    const data = await this.profileData.toData(dto);
    return this.prisma.profile.update({
      where: { id: profile.id },
      data,
      select: OWN_PROFILE_SELECT,
    });
  }

  async createPaymentOrder(userId: string) {
    const user = await this.requireUser(userId);
    const profile = await this.requireProfile(userId);
    if (profile.status === ProfileStatus.ACTIVE)
      throw new ConflictException('This profile is already published.');

    const order = await this.razorpay.createOrder(
      this.feePaise,
      CURRENCY,
      `profile_${profile.id}`,
      {
        profileId: profile.id,
        userId,
      },
    );
    await this.prisma.payment.create({
      data: {
        profileId: profile.id,
        userId,
        razorpayOrderId: order.id,
        amount: order.amount,
        currency: order.currency,
        status: PaymentStatus.CREATED,
        razorpayPaymentId: null,
        paidAt: null,
      },
    });

    return {
      keyId: this.razorpay.keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      prefill: { name: user.name, email: user.email, contact: user.phone },
    };
  }

  async verifyPayment(userId: string, dto: VerifyPaymentDto) {
    const payment = await this.prisma.payment.findUnique({
      where: { razorpayOrderId: dto.razorpayOrderId },
    });
    if (!payment || payment.userId !== userId) throw new NotFoundException('Payment not found');
    if (
      !this.razorpay.isValidPaymentSignature(
        dto.razorpayOrderId,
        dto.razorpayPaymentId,
        dto.razorpaySignature,
      )
    ) {
      throw new BadRequestException(
        'Payment verification failed. If money was deducted, it will be confirmed shortly.',
      );
    }
    await this.markPaid(dto.razorpayOrderId, dto.razorpayPaymentId);
    return this.get(userId);
  }

  /** Idempotent: safe to call from both the checkout callback and the webhook. */
  async markPaid(razorpayOrderId: string, razorpayPaymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { razorpayOrderId } });
    if (!payment) {
      this.logger.warn(`Paid order ${razorpayOrderId} is unknown`);
      return;
    }
    await this.prisma.$transaction([
      this.prisma.payment.updateMany({
        where: { id: payment.id, status: { not: PaymentStatus.PAID } },
        data: { status: PaymentStatus.PAID, razorpayPaymentId, paidAt: new Date() },
      }),
      ...(payment.profileId
        ? [
            this.prisma.profile.updateMany({
              where: { id: payment.profileId, status: ProfileStatus.PENDING_PAYMENT },
              data: { status: ProfileStatus.ACTIVE, publishedAt: new Date() },
            }),
          ]
        : []),
    ]);
  }

  async markFailed(razorpayOrderId: string) {
    await this.prisma.payment.updateMany({
      where: { razorpayOrderId, status: PaymentStatus.CREATED },
      data: { status: PaymentStatus.FAILED },
    });
  }

  private async requireUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) throw new UnauthorizedException('Account unavailable');
    return user;
  }

  private async requireProfile(userId: string) {
    const profile = await this.prisma.profile.findFirst({ where: { userId } });
    if (!profile) throw new NotFoundException('You have not created a profile yet');
    return profile;
  }
}
