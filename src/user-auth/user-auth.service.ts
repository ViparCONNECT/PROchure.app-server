import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OtpPurpose, Prisma, User } from '@prisma/client';
import { createHash, createHmac, randomInt, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { OtpProviderService } from '../otp-provider/otp-provider.service';
import { UserJwtPayload } from '../common/interfaces/user-jwt-payload.interface';
import {
  E164_REGEX,
  LoginSendOtpDto,
  LoginVerifyDto,
  RegisterSendOtpDto,
  RegisterVerifyDto,
} from './dto/user-auth.dto';

const MAX_OTPS_PER_HOUR = 5;

export interface OtpSentResponse {
  maskedPhone: string;
  expiresInSeconds: number;
  resendInSeconds: number;
}

export interface UserSession {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: PublicUser;
}

export type PublicUser = Pick<User, 'id' | 'name' | 'email' | 'phone'>;

@Injectable()
export class UserAuthService {
  private readonly logger = new Logger(UserAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly otpProvider: OtpProviderService,
  ) {}

  // ─── Registration ───────────────────────────────────────────────────────────

  async sendRegisterOtp(dto: RegisterSendOtpDto): Promise<OtpSentResponse> {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { phone: dto.phone }] },
    });
    if (existing) {
      throw new ConflictException(
        existing.email === dto.email
          ? 'An account with this email already exists. Please log in.'
          : 'An account with this mobile number already exists. Please log in.',
      );
    }
    return this.issueOtp(dto.phone, OtpPurpose.REGISTER, { name: dto.name, email: dto.email });
  }

  async verifyRegisterOtp(dto: RegisterVerifyDto): Promise<UserSession> {
    const otp = await this.consumeOtp(dto.phone, OtpPurpose.REGISTER, dto.otp);
    if (!otp.name || !otp.email)
      throw new BadRequestException('Registration details missing. Please start again.');

    try {
      const user = await this.prisma.user.create({
        data: { name: otp.name, email: otp.email, phone: dto.phone, lastLoginAt: new Date() },
      });
      return this.issueTokens(user);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('An account with these details already exists. Please log in.');
      }
      throw err;
    }
  }

  // ─── Login ──────────────────────────────────────────────────────────────────

  async sendLoginOtp(dto: LoginSendOtpDto): Promise<OtpSentResponse> {
    const user = await this.findByIdentifier(dto.identifier);
    if (!user || !user.isActive)
      throw new NotFoundException('No account found. Please register first.');
    return this.issueOtp(user.phone, OtpPurpose.LOGIN);
  }

  async verifyLoginOtp(dto: LoginVerifyDto): Promise<UserSession> {
    const user = await this.findByIdentifier(dto.identifier);
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid or expired OTP');
    await this.consumeOtp(user.phone, OtpPurpose.LOGIN, dto.otp);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return this.issueTokens(updated);
  }

  // ─── Session ────────────────────────────────────────────────────────────────

  async refresh(refreshToken: string): Promise<UserSession> {
    const stored = await this.prisma.userRefreshToken.findUnique({
      where: { tokenHash: this.sha256(refreshToken) },
    });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired. Please log in again.');
    }
    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user || !user.isActive) throw new UnauthorizedException('Account unavailable');

    const { count } = await this.prisma.userRefreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw new UnauthorizedException('Session expired. Please log in again.');

    return this.issueTokens(user);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await this.prisma.userRefreshToken.updateMany({
      where: { tokenHash: this.sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) throw new UnauthorizedException('Account unavailable');
    return this.toPublic(user);
  }

  // ─── OTP helpers ────────────────────────────────────────────────────────────

  private async issueOtp(
    phone: string,
    purpose: OtpPurpose,
    pending: { name?: string; email?: string } = {},
  ): Promise<OtpSentResponse> {
    const now = Date.now();
    const cooldownSec = this.config.get<number>('OTP_RESEND_COOLDOWN_SECONDS') ?? 30;
    const ttlMin = this.config.get<number>('OTP_TTL_MINUTES') ?? 5;

    const latest = await this.prisma.otpCode.findFirst({
      where: { phone, purpose },
      orderBy: { createdAt: 'desc' },
    });
    if (latest) {
      const waitSec = Math.ceil((latest.createdAt.getTime() + cooldownSec * 1000 - now) / 1000);
      if (waitSec > 0) {
        throw new HttpException(
          `Please wait ${waitSec}s before requesting a new OTP.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const sentLastHour = await this.prisma.otpCode.count({
      where: { phone, createdAt: { gte: new Date(now - 60 * 60 * 1000) } },
    });
    if (sentLastHour >= MAX_OTPS_PER_HOUR) {
      throw new HttpException(
        'Too many OTP requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // MSG91 generates and delivers the OTP; we keep its request id. Dev mode (no widget configured): local code.
    let reqId: string | null = null;
    let codeHash: string | null = null;
    if (this.otpProvider.isEnabled) {
      reqId = await this.otpProvider.sendOtp(phone);
    } else {
      const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
      codeHash = this.hashOtp(code);
      this.logger.warn(`[DEV] MSG91 OTP widget not configured — OTP for ${phone}: ${code}`);
    }

    await this.prisma.otpCode.updateMany({
      where: { phone, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    await this.prisma.otpCode.create({
      data: {
        phone,
        purpose,
        reqId,
        codeHash,
        expiresAt: new Date(now + ttlMin * 60 * 1000),
        // MongoDB: `where: { consumedAt: null }` doesn't match unset fields, so store an explicit null
        consumedAt: null,
        ...pending,
      },
    });

    return {
      maskedPhone: this.maskPhone(phone),
      expiresInSeconds: ttlMin * 60,
      resendInSeconds: cooldownSec,
    };
  }

  private async consumeOtp(phone: string, purpose: OtpPurpose, code: string) {
    const maxAttempts = this.config.get<number>('OTP_MAX_ATTEMPTS') ?? 5;
    const record = await this.prisma.otpCode.findFirst({
      where: { phone, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!record || record.expiresAt < new Date()) {
      throw new BadRequestException('OTP has expired. Please request a new one.');
    }

    // Atomically reserve an attempt so parallel guesses cannot exceed the limit
    const { count: reserved } = await this.prisma.otpCode.updateMany({
      where: { id: record.id, consumedAt: null, attempts: { lt: maxAttempts } },
      data: { attempts: { increment: 1 } },
    });
    if (reserved === 0)
      throw new BadRequestException('Too many incorrect attempts. Please request a new OTP.');

    const valid = record.reqId
      ? await this.otpProvider.verifyOtp(record.reqId, code)
      : !!record.codeHash &&
        timingSafeEqual(
          Buffer.from(record.codeHash, 'hex'),
          Buffer.from(this.hashOtp(code), 'hex'),
        );
    if (!valid) {
      const left = maxAttempts - (record.attempts + 1);
      throw new BadRequestException(
        left > 0
          ? `Incorrect OTP. ${left} attempt(s) left.`
          : 'Too many incorrect attempts. Please request a new OTP.',
      );
    }

    const { count: consumed } = await this.prisma.otpCode.updateMany({
      where: { id: record.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed === 0)
      throw new BadRequestException('OTP has already been used. Please request a new one.');

    return record;
  }

  // ─── Misc helpers ───────────────────────────────────────────────────────────

  private async findByIdentifier(identifier: string): Promise<User | null> {
    if (identifier.includes('@')) {
      return this.prisma.user.findUnique({ where: { email: identifier.toLowerCase() } });
    }
    if (!E164_REGEX.test(identifier)) {
      throw new BadRequestException('Enter a valid email or mobile number with country code.');
    }
    return this.prisma.user.findUnique({ where: { phone: identifier } });
  }

  private async issueTokens(user: User): Promise<UserSession> {
    const payload: UserJwtPayload = { sub: user.id, email: user.email, type: 'user' };
    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.getOrThrow<string>('USER_JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('USER_JWT_ACCESS_EXPIRES_IN') ?? '15m',
    });

    const refreshExpiresIn = this.config.get<string>('USER_JWT_REFRESH_EXPIRES_IN') ?? '30d';
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.getOrThrow<string>('USER_JWT_REFRESH_SECRET'),
      expiresIn: refreshExpiresIn,
    });
    const refreshExpiresAt = new Date(Date.now() + this.parseDurationMs(refreshExpiresIn));

    await this.prisma.userRefreshToken.create({
      data: {
        tokenHash: this.sha256(refreshToken),
        userId: user.id,
        expiresAt: refreshExpiresAt,
        revokedAt: null,
      },
    });

    return { accessToken, refreshToken, refreshExpiresAt, user: this.toPublic(user) };
  }

  private toPublic({ id, name, email, phone }: User): PublicUser {
    return { id, name, email, phone };
  }

  private hashOtp(code: string): string {
    return createHmac('sha256', this.config.getOrThrow<string>('USER_JWT_ACCESS_SECRET'))
      .update(code)
      .digest('hex');
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private maskPhone(phone: string): string {
    return `${phone.slice(0, 3)}******${phone.slice(-4)}`;
  }

  private parseDurationMs(duration: string): number {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) return 30 * 24 * 60 * 60 * 1000;
    const map: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return parseInt(match[1]) * map[match[2]];
  }
}
