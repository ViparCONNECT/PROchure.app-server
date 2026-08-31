import { Test, TestingModule } from '@nestjs/testing';
import { RolesGuard } from './roles.guard';
import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { AdminRole } from '@prisma/client';

function buildContext(role: AdminRole | undefined, handlerRoles: AdminRole[]) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) }),
  };
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RolesGuard, Reflector],
    }).compile();
    guard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  it('allows when no roles required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
    expect(guard.canActivate(buildContext(undefined, []) as any)).toBe(true);
  });

  it('allows SUPER_ADMIN when SUPER_ADMIN required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([AdminRole.SUPER_ADMIN]);
    expect(guard.canActivate(buildContext(AdminRole.SUPER_ADMIN, [AdminRole.SUPER_ADMIN]) as any)).toBe(true);
  });

  it('throws ForbiddenException for ADMIN when SUPER_ADMIN required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([AdminRole.SUPER_ADMIN]);
    expect(() =>
      guard.canActivate(buildContext(AdminRole.ADMIN, [AdminRole.SUPER_ADMIN]) as any),
    ).toThrow(ForbiddenException);
  });
});
