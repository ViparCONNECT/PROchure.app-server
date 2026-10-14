import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { UserJwtPayload } from '../../common/interfaces/user-jwt-payload.interface';

export const USER_REFRESH_COOKIE = 'userRefreshToken';

@Injectable()
export class UserJwtRefreshStrategy extends PassportStrategy(Strategy, 'user-jwt-refresh') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: (req: Request) =>
        (req.cookies?.[USER_REFRESH_COOKIE] as string | undefined) ?? null,
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('USER_JWT_REFRESH_SECRET'),
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: UserJwtPayload): UserJwtPayload & { refreshToken: string } {
    if (payload.type !== 'user') throw new UnauthorizedException();
    return { ...payload, refreshToken: req.cookies[USER_REFRESH_COOKIE] as string };
  }
}
