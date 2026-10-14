import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class UserJwtAuthGuard extends AuthGuard('user-jwt') {}

@Injectable()
export class UserJwtRefreshGuard extends AuthGuard('user-jwt-refresh') {}
