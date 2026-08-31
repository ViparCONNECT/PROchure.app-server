import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditLogParams {
  adminId?: string;
  action: string;
  entity?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: AuditLogParams): Promise<void> {
    // Use UncheckedCreateInput so adminId can be supplied as a raw ObjectId string
    const data: Prisma.AuditLogUncheckedCreateInput = {
      action: params.action,
      adminId: params.adminId,
      entity: params.entity,
      entityId: params.entityId,
      metadata: params.metadata as Prisma.InputJsonValue,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    };
    await this.prisma.auditLog.create({ data }).catch(() => {
      // Audit failures must not break main request flow
    });
  }
}
