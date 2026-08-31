import {
  Controller,
  Post,
  Body,
  Res,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { PasswordResetRequestDto } from './dto/password-reset-request.dto';
import { PasswordResetConfirmDto } from './dto/password-reset-confirm.dto';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin login' })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken } = await this.authService.login(
      dto,
      req.ip ?? '',
      req.headers['user-agent'] ?? '',
    );
    this.setRefreshCookie(res, refreshToken);
    return { accessToken };
  }

  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Rotate access + refresh tokens (pass refreshToken as Bearer in Swagger)' })
  async refresh(
    @Req() req: Request & { user: JwtPayload & { refreshToken: string } },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = await this.authService.refresh(
      req.user,
      req.ip ?? '',
      req.headers['user-agent'] ?? '',
    );
    this.setRefreshCookie(res, refreshToken);
    return { accessToken };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout and revoke refresh token' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.['refreshToken'] as string | undefined;
    if (token) await this.authService.logout(token);
    res.clearCookie('refreshToken');
  }

  @UseGuards(JwtAuthGuard)
  @Post('admin-password-reset/request')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Request password reset for an admin (SUPER_ADMIN only)' })
  async requestReset(
    @Body() dto: PasswordResetRequestDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.authService.requestPasswordReset(dto, user.sub, req.ip ?? '', req.headers['user-agent'] ?? '');
  }

  @Post('admin-password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete password reset using token' })
  async confirmReset(@Body() dto: PasswordResetConfirmDto, @Req() req: Request) {
    return this.authService.confirmPasswordReset(dto, req.ip ?? '', req.headers['user-agent'] ?? '');
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private setRefreshCookie(res: Response, token: string) {
    const secure = this.config.get<boolean>('COOKIE_SECURE') ?? false;
    const sameSite = (this.config.get<string>('COOKIE_SAME_SITE') ?? 'lax') as 'lax' | 'strict' | 'none';
    res.cookie('refreshToken', token, {
      httpOnly: true,
      secure,
      sameSite,
      path: '/api/v1/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
}
