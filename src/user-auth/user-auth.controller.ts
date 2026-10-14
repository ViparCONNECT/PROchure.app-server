import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { UserAuthService, UserSession } from './user-auth.service';
import {
  LoginSendOtpDto,
  LoginVerifyDto,
  RegisterSendOtpDto,
  RegisterVerifyDto,
} from './dto/user-auth.dto';
import { UserJwtAuthGuard, UserJwtRefreshGuard } from './guards/user-auth.guards';
import { USER_REFRESH_COOKIE } from './strategies/user-jwt-refresh.strategy';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserJwtPayload } from '../common/interfaces/user-jwt-payload.interface';

const COOKIE_PATH = '/api/v1/users/auth';

@ApiTags('user-auth')
@Controller({ path: 'users/auth', version: '1' })
export class UserAuthController {
  constructor(
    private readonly userAuth: UserAuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('register/send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start registration — sends OTP to WhatsApp' })
  sendRegisterOtp(@Body() dto: RegisterSendOtpDto) {
    return this.userAuth.sendRegisterOtp(dto);
  }

  @Post('register/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify registration OTP — creates the account and logs in' })
  async verifyRegister(@Body() dto: RegisterVerifyDto, @Res({ passthrough: true }) res: Response) {
    return this.startSession(res, await this.userAuth.verifyRegisterOtp(dto));
  }

  @Post('login/send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send login OTP to the WhatsApp number of the account (by email or phone)',
  })
  sendLoginOtp(@Body() dto: LoginSendOtpDto) {
    return this.userAuth.sendLoginOtp(dto);
  }

  @Post('login/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify login OTP' })
  async verifyLogin(@Body() dto: LoginVerifyDto, @Res({ passthrough: true }) res: Response) {
    return this.startSession(res, await this.userAuth.verifyLoginOtp(dto));
  }

  @UseGuards(UserJwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Rotate user session using the refresh cookie' })
  async refresh(
    @Req() req: Request & { user: UserJwtPayload & { refreshToken: string } },
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.startSession(res, await this.userAuth.refresh(req.user.refreshToken));
  }

  @UseGuards(UserJwtAuthGuard)
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current user' })
  me(@CurrentUser() user: UserJwtPayload) {
    return this.userAuth.me(user.sub);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Logout and revoke the refresh cookie' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.userAuth.logout(req.cookies?.[USER_REFRESH_COOKIE] as string | undefined);
    res.clearCookie(USER_REFRESH_COOKIE, this.cookieOptions());
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private startSession(
    res: Response,
    { accessToken, refreshToken, refreshExpiresAt, user }: UserSession,
  ) {
    res.cookie(USER_REFRESH_COOKIE, refreshToken, {
      ...this.cookieOptions(),
      expires: refreshExpiresAt,
    });
    return { accessToken, user };
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.get<boolean>('COOKIE_SECURE') ?? false,
      sameSite: (this.config.get<string>('COOKIE_SAME_SITE') ?? 'lax') as 'lax' | 'strict' | 'none',
      path: COOKIE_PATH,
    };
  }
}
