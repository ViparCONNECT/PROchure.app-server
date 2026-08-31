import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: config.getOrThrow<string>('MAIL_HOST'),
      port: config.get<number>('MAIL_PORT') ?? 587,
      secure: config.get<boolean>('MAIL_SECURE') ?? false,
      auth: {
        user: config.getOrThrow<string>('MAIL_USER'),
        pass: config.getOrThrow<string>('MAIL_PASS'),
      },
    });
  }

  async sendPasswordReset(to: string, firstName: string, resetLink: string): Promise<void> {
    const from = this.config.getOrThrow<string>('MAIL_FROM');
    const ttl = this.config.get<number>('PASSWORD_RESET_TTL_MINUTES') ?? 30;

    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: 'Admin Password Reset',
        html: this.buildResetHtml(firstName, resetLink, ttl),
        text: `Hi ${firstName},\n\nYour password reset link (expires in ${ttl} minutes):\n${resetLink}\n\nIf you did not request this, ignore this email.`,
      });
    } catch (err) {
      // Log but don't surface SMTP errors to the caller
      this.logger.error('Failed to send password reset email', err);
    }
  }

  private buildResetHtml(firstName: string, resetLink: string, ttlMinutes: number): string {
    return `
      <!DOCTYPE html>
      <html>
        <body style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
          <h2>Admin Password Reset</h2>
          <p>Hi ${firstName},</p>
          <p>A password reset was requested for your account. Click the button below to set a new password.
             This link expires in <strong>${ttlMinutes} minutes</strong> and can only be used once.</p>
          <p style="margin:32px 0">
            <a href="${resetLink}"
               style="background:#1a56db;color:#fff;padding:12px 24px;border-radius:4px;text-decoration:none">
              Reset Password
            </a>
          </p>
          <p>Or copy this URL into your browser:<br>
             <code style="word-break:break-all">${resetLink}</code></p>
          <p style="color:#888;font-size:12px">If you did not request this reset, you can safely ignore this email.</p>
        </body>
      </html>
    `;
  }
}
