import { Test, TestingModule } from '@nestjs/testing';
import { AdminsService } from './admins.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdminRole } from '@prisma/client';

const mockPrisma = {
  admin: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  refreshToken: { updateMany: jest.fn() },
  $transaction: jest.fn((cb: any) => cb(mockPrisma)),
};

const mockAuditLogs = { log: jest.fn() };

describe('AdminsService', () => {
  let service: AdminsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogsService, useValue: mockAuditLogs },
      ],
    }).compile();
    service = module.get<AdminsService>(AdminsService);
    jest.clearAllMocks();
  });

  it('create — throws ConflictException for duplicate email', async () => {
    mockPrisma.admin.findUnique.mockResolvedValue({ id: '1', email: 'a@b.com' });
    await expect(
      service.create(
        { email: 'a@b.com', password: 'Pass@1234', role: AdminRole.ADMIN, firstName: 'A', lastName: 'B' },
        { sub: 'actor', email: 'super@b.com', role: AdminRole.SUPER_ADMIN },
        '127.0.0.1',
        'test',
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('findOne — throws NotFoundException for unknown id', async () => {
    mockPrisma.admin.findFirst.mockResolvedValue(null);
    await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
  });
});
