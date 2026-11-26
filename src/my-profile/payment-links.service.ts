import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_PROFILE_SELECT } from '../profiles/profile-data.service';
import { MyProfileService } from './my-profile.service';
import { VerifyPaymentDto } from './dto/verify-payment.dto';

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'profile';

const profileCodeFromSlug = (slug: string) => {
  const match = slug.trim().toUpperCase().match(/^([A-Z]+-\d+)(?:-[A-Z0-9-]+)?$/);
  return match?.[1] ?? null;
};

/**
 * Shareable "pay the listing fee" links for a profile (mainly admin-created ones).
 * Public URLs use the trusted profile-code/name slug instead of an opaque token.
 */
@Injectable()
export class PaymentLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly myProfile: MyProfileService,
  ) {}

  // ─── Admin ───────────────────────────────────────────────────────────────

  /** Returns the profile's stable public payment link. */
  async getOrCreateLink(profileId: string, _regenerate = false) {
    const profile = await this.prisma.profile.findUnique({ where: { id: profileId } });
    if (!profile) throw new NotFoundException('Profile not found');
    if (!profile.userId) {
      throw new ConflictException(
        'Add an owner login (email & mobile) to this profile before creating a payment link.',
      );
    }

    const code = String(profile.profileCode ?? '').trim().toUpperCase();
    if (!code) throw new ConflictException('This profile does not have a public profile code yet.');

    const identifier = `${code}-${slugify(profile.name)}`;
    if (profile.paymentLinkToken !== identifier) {
      await this.prisma.profile.update({
        where: { id: profileId },
        data: { paymentLinkToken: identifier },
      });
    }

    const base = (this.config.get<string>('PUBLIC_APP_URL') ?? 'https://prochure.app').replace(/\/+$/, '');
    return { url: `${base}/pay/${identifier}`, paid: !!profile.paidAt, paidAt: profile.paidAt };
  }

  // ─── Public (no login) ──────────────────────────────────────────────────────

  async getByToken(identifier: string) {
    const profile = await this.findByIdentifier(identifier);
    if (!profile) throw new NotFoundException('This payment link is invalid or unavailable.');
    const { paidAt, user, ...card } = profile;
    return {
      profile: card,
      ownerName: user?.name ?? null,
      fee: this.myProfile.fee,
      paid: !!paidAt,
      paidAt,
    };
  }

  async createOrder(identifier: string) {
    const { profile, user } = await this.requireByIdentifier(identifier);
    return this.myProfile.createOrderFor(profile, user);
  }

  async verify(identifier: string, dto: VerifyPaymentDto) {
    const { profile } = await this.requireByIdentifier(identifier);
    const payment = await this.prisma.payment.findUnique({
      where: { razorpayOrderId: dto.razorpayOrderId },
    });
    if (!payment || payment.profileId !== profile.id)
      throw new NotFoundException('Payment not found');
    await this.myProfile.verifyAndMarkPaid(dto);
    return this.getByToken(identifier);
  }

  private async findByIdentifier(identifier: string) {
    const exact = await this.prisma.profile.findFirst({
      where: { paymentLinkToken: identifier },
      select: { ...PUBLIC_PROFILE_SELECT, paidAt: true, user: { select: { name: true } } },
    });
    if (exact) return exact;

    const code = profileCodeFromSlug(identifier);
    if (!code) return null;
    return this.prisma.profile.findFirst({
      where: { profileCode: code },
      select: { ...PUBLIC_PROFILE_SELECT, paidAt: true, user: { select: { name: true } } },
    });
  }

  private async requireByIdentifier(identifier: string) {
    const profile = await this.prisma.profile.findFirst({
      where: (() => {
        const code = profileCodeFromSlug(identifier);
        return code ? { OR: [{ paymentLinkToken: identifier }, { profileCode: code }] } : { paymentLinkToken: identifier };
      })(),
      include: { user: true },
    });
    if (!profile) throw new NotFoundException('This payment link is invalid or unavailable.');
    if (!profile.user || !profile.user.isActive) {
      throw new ConflictException(
        'This profile has no active owner account. Please contact PROchure.',
      );
    }
    return { profile, user: profile.user };
  }
}
