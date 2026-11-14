import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CategoryType, ConsultantKind, Prisma, ProfileStatus, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminCreateProfileDto,
  AdminUpdateProfileDto,
  ListProfilesDto,
  ProfileOwnerDto,
} from './dto/admin-profile.dto';
import { paginate } from '../common/dto/pagination.dto';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { PROFILE_INCLUDE, ProfileDataService } from './profile-data.service';

const ADMIN_INCLUDE = {
  ...PROFILE_INCLUDE,
  user: { select: { id: true, name: true, email: true, phone: true } },
} satisfies Prisma.ProfileInclude;

@Injectable()
export class ProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profileData: ProfileDataService,
  ) {}

  /** Admin-created profiles are live immediately (no payment) and create/link the owner's login account. */
  async create(dto: AdminCreateProfileDto, actor: JwtPayload) {
    const owner = await this.resolveOwner(dto.owner, dto.name);
    const data = this.toAdminProfileData(dto);
    const profileCode = await this.generateProfileCode();

    return this.prisma.profile.create({
      data: {
        ...data,
        profileCode,
        status: ProfileStatus.ACTIVE,
        isDisabled: dto.isDisabled ?? false,
        userId: owner.id,
        profileCreatedById: actor.sub,
        publishedAt: new Date(),
      } as any,
      include: ADMIN_INCLUDE,
    });
  }

  async findAll(query: ListProfilesDto) {
    const { page, limit, search, type, categoryId, subCategoryId, status, isDisabled } = query;

    const where: Prisma.ProfileWhereInput = {
      ...(type ? { category: { is: { type } } } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(subCategoryId ? { subCategoryId } : {}),
      ...(status ? { status } : {}),
      ...(isDisabled !== undefined ? { isDisabled } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { consultantName: { contains: search, mode: 'insensitive' } },
              { user: { is: { email: { contains: search, mode: 'insensitive' } } } },
              { user: { is: { phone: { contains: search } } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.profile.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: ADMIN_INCLUDE,
      }),
      this.prisma.profile.count({ where }),
    ]);
    return paginate(items, total, page, limit);
  }

  async findOne(id: string) {
    const profile = await this.prisma.profile.findUnique({ where: { id }, include: ADMIN_INCLUDE });
    if (!profile) throw new NotFoundException('Profile not found');
    return profile;
  }

  async update(id: string, dto: AdminUpdateProfileDto) {
    const current = await this.findOne(id);
    const data = this.toAdminProfileData(dto);

    let userId = current.userId;
    if (dto.owner) {
      if (current.user) {
        if (current.user.email !== dto.owner.email || current.user.phone !== dto.owner.phone) {
          throw new ConflictException('The owner login of this profile cannot be changed');
        }
      } else {
        userId = (await this.resolveOwner(dto.owner, dto.name)).id;
      }
    }

    return this.prisma.profile.update({
      where: { id },
      data: { ...data, isDisabled: dto.isDisabled ?? current.isDisabled, userId },
      include: ADMIN_INCLUDE,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.profile.delete({ where: { id } });
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async generateProfileCode(): Promise<string> {
    let counter = 1;
    while (true) {
      const code = `PRO-${counter}`;
      const existing = await this.prisma.profile.findUnique({
        where: { profileCode: code },
      } as any);
      if (!existing) return code;
      counter += 1;
    }
  }

  private toAdminProfileData(
    dto: AdminCreateProfileDto | AdminUpdateProfileDto,
  ): Prisma.ProfileUncheckedCreateInput {
    const kind =
      dto.profileType === CategoryType.PROFESSIONAL_CONSULTANT ? dto.consultantKind ?? null : null;
    const independent = kind === ConsultantKind.INDEPENDENT;
    const normalizeDay = (day?: { closed?: boolean; open?: string | null; close?: string | null; breakStart?: string | null; breakEnd?: string | null } | null) => ({
      closed: day?.closed ?? false,
      open: day?.open ?? null,
      close: day?.close ?? null,
      breakStart: day?.breakStart ?? null,
      breakEnd: day?.breakEnd ?? null,
    });

    return {
      categoryId: dto.categoryId,
      subCategoryId: dto.subCategoryId ?? null,
      consultantKind: kind,
      name: dto.name,
      consultantName: kind === ConsultantKind.CONSULTANCY ? dto.consultantName ?? null : null,
      degrees: independent ? dto.degrees ?? null : null,
      registrationNumber: independent ? dto.registrationNumber ?? null : null,
      gstin: dto.gstin ?? null,
      servicesOffered: dto.servicesOffered ?? '',
      servicesDetail: dto.servicesDetail ?? null,
      sinceYear: dto.sinceYear ?? '',
      isWomenEntrepreneur: dto.isWomenEntrepreneur ?? false,
      contactNumbers: dto.contactNumbers ?? [],
      emails: dto.emails ?? [],
      address: {
        buildingMallPropertyName: dto.address?.buildingMallPropertyName ?? null,
        doorShopNo: dto.address?.doorShopNo ?? null,
        floor: dto.address?.floor ?? null,
        streetLaneRoadNameSubLocality: dto.address?.streetLaneRoadNameSubLocality ?? null,
        nearestLandmark: dto.address?.nearestLandmark ?? null,
        secondaryPrimaryLocality: dto.address?.secondaryPrimaryLocality ?? null,
        cityTown: dto.address?.cityTown ?? null,
        stateProvince: dto.address?.stateProvince ?? null,
        country: dto.address?.country ?? null,
        pinCodeZipCode: dto.address?.pinCodeZipCode ?? null,
      },
      workingHours: {
        weekdays: normalizeDay(dto.workingHours?.weekdays),
        saturday: normalizeDay(dto.workingHours?.saturday),
        sunday: normalizeDay(dto.workingHours?.sunday),
      },
      languages: dto.languages ?? [],
    } as Prisma.ProfileUncheckedCreateInput;
  }

  /** Finds or creates the owner's user account. One profile per user. */
  private async resolveOwner(owner: ProfileOwnerDto, name: string): Promise<User> {
    const matches = await this.prisma.user.findMany({
      where: { OR: [{ email: owner.email }, { phone: owner.phone }] },
    });

    if (matches.length > 1) {
      throw new ConflictException(
        'This email and mobile number belong to two different user accounts',
      );
    }

    const [existing] = matches;
    if (existing) {
      if (existing.email !== owner.email || existing.phone !== owner.phone) {
        throw new ConflictException(
          existing.email === owner.email
            ? `This email is already registered with mobile number ${existing.phone}`
            : `This mobile number is already registered with email ${existing.email}`,
        );
      }
      const hasProfile = await this.prisma.profile.count({ where: { userId: existing.id } });
      if (hasProfile) throw new ConflictException('This user already has a profile');
      return existing;
    }

    try {
      return await this.prisma.user.create({
        data: { name, email: owner.email, phone: owner.phone },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A user with this email or mobile number already exists');
      }
      throw err;
    }
  }
}
