import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProfileStatus, User } from '@prisma/client';
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
    const data = await this.profileData.toData(dto);
    const owner = await this.resolveOwner(dto.owner, dto.name);

    return this.prisma.profile.create({
      data: {
        ...data,
        status: ProfileStatus.ACTIVE,
        isDisabled: dto.isDisabled ?? false,
        userId: owner.id,
        profileCreatedById: actor.sub,
        publishedAt: new Date(),
      },
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
    const data = await this.profileData.toData(dto);

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
