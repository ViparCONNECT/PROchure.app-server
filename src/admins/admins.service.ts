import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { PaginationDto, paginate } from '../common/dto/pagination.dto';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import * as argon2 from 'argon2';
import { Admin } from '@prisma/client';

// Fields never returned in responses
const SENSITIVE_FIELDS = { passwordHash: false };

@Injectable()
export class AdminsService {
  private readonly logger = new Logger(AdminsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async create(dto: CreateAdminDto, actor: JwtPayload, ip: string, userAgent: string) {
    const normalized = dto.email.toLowerCase().trim();
    const existing = await this.prisma.admin.findUnique({ where: { email: normalized } });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await argon2.hash(dto.password);
    const admin = await this.prisma.admin.create({
      data: {
        email: normalized,
        firstName: dto.firstName,
        lastName: dto.lastName,
        passwordHash,
        role: dto.role,
      },
      select: this.safeSelect(),
    });

    await this.auditLogs.log({
      adminId: actor.sub,
      action: 'ADMIN_CREATED',
      entity: 'Admin',
      entityId: admin.id,
      ipAddress: ip,
      userAgent,
    });

    return admin;
  }

  async findAll(query: PaginationDto) {
    const { page, limit, search } = query;
    const skip = (page - 1) * limit;

    const where = {
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' as const } },
              { firstName: { contains: search, mode: 'insensitive' as const } },
              { lastName: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.admin.findMany({ where, skip, take: limit, select: this.safeSelect(), orderBy: { createdAt: 'desc' } }),
      this.prisma.admin.count({ where }),
    ]);

    return paginate(items, total, page, limit);
  }

  async findOne(id: string) {
    const admin = await this.prisma.admin.findFirst({
      where: { id, deletedAt: null },
      select: this.safeSelect(),
    });
    if (!admin) throw new NotFoundException('Admin not found');
    return admin;
  }

  async update(id: string, dto: UpdateAdminDto, actor: JwtPayload, ip: string, userAgent: string) {
    const admin = await this.prisma.admin.findFirst({ where: { id, deletedAt: null } });
    if (!admin) throw new NotFoundException('Admin not found');

    // Cannot demote the last SUPER_ADMIN
    if (dto.role && admin.role === 'SUPER_ADMIN' && dto.role !== 'SUPER_ADMIN') {
      const superAdminCount = await this.prisma.admin.count({
        where: { role: 'SUPER_ADMIN', deletedAt: null, isActive: true },
      });
      if (superAdminCount <= 1) {
        throw new BadRequestException('Cannot demote the last Super Admin');
      }
    }

    const updated = await this.prisma.admin.update({
      where: { id },
      data: dto,
      select: this.safeSelect(),
    });

    await this.auditLogs.log({
      adminId: actor.sub,
      action: 'ADMIN_UPDATED',
      entity: 'Admin',
      entityId: id,
      metadata: { fields: Object.keys(dto) },
      ipAddress: ip,
      userAgent,
    });

    return updated;
  }

  async softDelete(id: string, actor: JwtPayload, ip: string, userAgent: string) {
    const admin = await this.prisma.admin.findFirst({ where: { id, deletedAt: null } });
    if (!admin) throw new NotFoundException('Admin not found');

    if (admin.id === actor.sub) {
      throw new ForbiddenException('Cannot delete your own account');
    }

    // Prevent deleting last SUPER_ADMIN
    if (admin.role === 'SUPER_ADMIN') {
      const count = await this.prisma.admin.count({ where: { role: 'SUPER_ADMIN', deletedAt: null } });
      if (count <= 1) throw new BadRequestException('Cannot delete the last Super Admin');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.admin.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
      await tx.refreshToken.updateMany({ where: { adminId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    });

    await this.auditLogs.log({
      adminId: actor.sub,
      action: 'ADMIN_DELETED',
      entity: 'Admin',
      entityId: id,
      ipAddress: ip,
      userAgent,
    });
  }

  private safeSelect() {
    return {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
    };
  }
}
