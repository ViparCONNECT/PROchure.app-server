import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(config: ConfigService) {
    super({
      // Accept refresh token from cookie first, fall back to Bearer header (for Swagger)
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req.cookies?.['refreshToken'] as string | null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: JwtPayload): JwtPayload & { refreshToken: string } {
    const refreshToken =
      (req.cookies?.['refreshToken'] as string | undefined) ??
      (req.headers.authorization?.replace('Bearer ', '') ?? '');
    return { ...payload, refreshToken };
  }
}
