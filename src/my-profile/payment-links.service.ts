import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_PROFILE_SELECT } from '../profiles/profile-data.service';
import { MyProfileService } from './my-profile.service';
import { VerifyPaymentDto } from './dto/verify-payment.dto';

/**
 * Shareable "pay the listing fee" links for a profile (mainly admin-created ones).
 * The link works without login until the fee is paid; regenerating it invalidates the previous link.
 */
@Injectable()
export class PaymentLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly myProfile: MyProfileService,
  ) {}

  // ─── Admin ───────────────────────────────────────────────────────────────

  /** Returns the profile's payment link, creating one if needed (or a fresh one when `regenerate`). */
  async getOrCreateLink(profileId: string, regenerate = false) {
    const profile = await this.prisma.profile.findUnique({ where: { id: profileId } });
    if (!profile) throw new NotFoundException('Profile not found');
    if (!profile.userId) {
      throw new ConflictException(
        'Add an owner login (email & mobile) to this profile before creating a payment link.',
      );
    }

    let token = profile.paymentLinkToken;
    if (!token || regenerate) {
      token = randomBytes(24).toString('base64url');
      await this.prisma.profile.update({
        where: { id: profileId },
        data: { paymentLinkToken: token },
      });
    }

    const base = (this.config.get<string>('PUBLIC_APP_URL') ?? 'https://prochure.app').replace(
      /\/+$/,
      '',
    );
    return { url: `${base}/pay/${token}`, paid: !!profile.paidAt, paidAt: profile.paidAt };
  }

  // ─── Public (no login) ──────────────────────────────────────────────────────

  async getByToken(token: string) {
    const profile = await this.prisma.profile.findFirst({
      where: { paymentLinkToken: token },
      select: { ...PUBLIC_PROFILE_SELECT, paidAt: true, user: { select: { name: true } } },
    });
    if (!profile) throw new NotFoundException('This payment link is invalid or has been replaced.');
    const { paidAt, user, ...card } = profile;
    return {
      profile: card,
      ownerName: user?.name ?? null,
      fee: this.myProfile.fee,
      paid: !!paidAt,
      paidAt,
    };
  }

  async createOrder(token: string) {
    const { profile, user } = await this.requireByToken(token);
    return this.myProfile.createOrderFor(profile, user);
  }

  async verify(token: string, dto: VerifyPaymentDto) {
    const { profile } = await this.requireByToken(token);
    const payment = await this.prisma.payment.findUnique({
      where: { razorpayOrderId: dto.razorpayOrderId },
    });
    if (!payment || payment.profileId !== profile.id)
      throw new NotFoundException('Payment not found');
    await this.myProfile.verifyAndMarkPaid(dto);
    return this.getByToken(token);
  }

  private async requireByToken(token: string) {
    const profile = await this.prisma.profile.findFirst({
      where: { paymentLinkToken: token },
      include: { user: true },
    });
    if (!profile) throw new NotFoundException('This payment link is invalid or has been replaced.');
    if (!profile.user || !profile.user.isActive) {
      throw new ConflictException(
        'This profile has no active owner account. Please contact PROchure.',
      );
    }
    return { profile, user: profile.user };
  }
}
