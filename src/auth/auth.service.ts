import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { MailService } from '../mail/mail.service';
import { LoginDto } from './dto/login.dto';
import { PasswordResetRequestDto } from './dto/password-reset-request.dto';
import { PasswordResetConfirmDto } from './dto/password-reset-confirm.dto';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import * as argon2 from 'argon2';
import { randomBytes, createHash } from 'crypto';

// Common weak passwords list
const WEAK_PASSWORDS = new Set([
  'password', 'Password1', 'Password@1', '12345678', 'password1',
  'qwerty123', 'admin123', 'letmein1',
]);

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly auditLogs: AuditLogsService,
    private readonly mailService: MailService,
  ) {}

  async login(dto: LoginDto, ip: string, userAgent: string) {
    const normalizedEmail = dto.email.toLowerCase().trim();
    const admin = await this.prisma.admin.findUnique({ where: { email: normalizedEmail } });

    if (!admin || admin.deletedAt || !admin.isActive) {
      await this.auditLogs.log({
        action: 'AUTH_LOGIN_FAILED',
        metadata: { email: normalizedEmail, reason: 'not_found_or_inactive' },
        ipAddress: ip,
        userAgent,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await argon2.verify(admin.passwordHash, dto.password);
    if (!passwordValid) {
      await this.auditLogs.log({
        adminId: admin.id,
        action: 'AUTH_LOGIN_FAILED',
        metadata: { reason: 'wrong_password' },
        ipAddress: ip,
        userAgent,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.admin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    await this.auditLogs.log({
      adminId: admin.id,
      action: 'AUTH_LOGIN',
      ipAddress: ip,
      userAgent,
    });

    return this.issueTokens({ sub: admin.id, email: admin.email, role: admin.role });
  }

  async refresh(payload: JwtPayload & { refreshToken: string }, ip: string, userAgent: string) {
    const tokenHash = this.hashToken(payload.refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const admin = await this.prisma.admin.findUnique({ where: { id: stored.adminId } });
    if (!admin || admin.deletedAt || !admin.isActive) {
      throw new UnauthorizedException('Account unavailable');
    }

    // Rotate token
    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

    return this.issueTokens({ sub: admin.id, email: admin.email, role: admin.role });
  }

  async logout(refreshToken: string) {
    if (!refreshToken) return;
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async requestPasswordReset(dto: PasswordResetRequestDto, requestedByAdminId: string, ip: string, userAgent: string) {
    const normalizedEmail = dto.email.toLowerCase().trim();
    const admin = await this.prisma.admin.findUnique({ where: { email: normalizedEmail } });

    // Always return success to prevent email enumeration
    if (!admin || admin.deletedAt || !admin.isActive) {
      return { message: 'If the account exists, a reset link has been sent.' };
    }

    const requester = await this.prisma.admin.findUnique({ where: { id: requestedByAdminId } });
    if (!requester || requester.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only Super Admin can initiate password resets');
    }

    // Invalidate existing tokens for this admin
    await this.prisma.passwordResetToken.updateMany({
      where: { adminId: admin.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const ttl = this.config.get<number>('PASSWORD_RESET_TTL_MINUTES') ?? 30;

    await this.prisma.passwordResetToken.create({
      data: {
        tokenHash,
        adminId: admin.id,
        expiresAt: new Date(Date.now() + ttl * 60 * 1000),
      },
    });

    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    const resetLink = `${frontendUrl}/admin/reset-password?token=${rawToken}`;
    await this.mailService.sendPasswordReset(admin.email, admin.firstName, resetLink);

    await this.auditLogs.log({
      adminId: requestedByAdminId,
      action: 'AUTH_PASSWORD_RESET_REQUESTED',
      entity: 'Admin',
      entityId: admin.id,
      ipAddress: ip,
      userAgent,
    });

    return { message: 'If the account exists, a reset link has been sent.' };
  }

  async confirmPasswordReset(dto: PasswordResetConfirmDto, ip: string, userAgent: string) {
    const tokenHash = this.hashToken(dto.token);
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Token is invalid or has expired');
    }

    this.enforcePasswordPolicy(dto.newPassword);

    const passwordHash = await argon2.hash(dto.newPassword);

    await this.prisma.$transaction(async (tx: Parameters<Parameters<typeof this.prisma.$transaction>[0]>[0]) => {
      await tx.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
      await tx.admin.update({ where: { id: record.adminId }, data: { passwordHash } });
      // Revoke all refresh tokens
      await tx.refreshToken.updateMany({
        where: { adminId: record.adminId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    await this.auditLogs.log({
      adminId: record.adminId,
      action: 'AUTH_PASSWORD_RESET_COMPLETED',
      entity: 'Admin',
      entityId: record.adminId,
      ipAddress: ip,
      userAgent,
    });

    return { message: 'Password has been reset successfully.' };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async issueTokens(payload: JwtPayload) {
    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m',
    });

    // Refresh token is a signed JWT so passport-jwt can verify it
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d',
    });

    const refreshHash = this.hashToken(refreshToken);
    const refreshExpiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';
    const refreshExpiresAt = new Date(Date.now() + this.parseDurationMs(refreshExpiresIn));

    await this.prisma.refreshToken.create({
      data: { tokenHash: refreshHash, adminId: payload.sub, expiresAt: refreshExpiresAt },
    });

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private enforcePasswordPolicy(password: string): void {
    const minLength = this.config.get<number>('PASSWORD_MIN_LENGTH') ?? 8;
    if (password.length < minLength) {
      throw new BadRequestException(`Password must be at least ${minLength} characters`);
    }
    if (WEAK_PASSWORDS.has(password)) {
      throw new BadRequestException('Password is too common');
    }
    if (!/[A-Z]/.test(password)) throw new BadRequestException('Password must contain an uppercase letter');
    if (!/[a-z]/.test(password)) throw new BadRequestException('Password must contain a lowercase letter');
    if (!/[0-9]/.test(password)) throw new BadRequestException('Password must contain a digit');
    if (!/[^A-Za-z0-9]/.test(password)) throw new BadRequestException('Password must contain a special character');
  }

  private parseDurationMs(duration: string): number {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) return 7 * 24 * 60 * 60 * 1000;
    const n = parseInt(match[1]);
    const unit = match[2];
    const map: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return n * (map[unit] ?? 86400000);
  }
}
