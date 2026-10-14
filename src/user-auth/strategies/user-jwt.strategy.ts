import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UserJwtPayload } from '../../common/interfaces/user-jwt-payload.interface';

@Injectable()
export class UserJwtStrategy extends PassportStrategy(Strategy, 'user-jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('USER_JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: UserJwtPayload): UserJwtPayload {
    if (payload.type !== 'user') throw new UnauthorizedException();
    return payload;
  }
}
