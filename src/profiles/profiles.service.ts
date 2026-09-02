import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ListProfilesDto } from './dto/list-profiles.dto';
import { paginate } from '../common/dto/pagination.dto';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProfileDto, actor: JwtPayload) {
    await this.validateCategoryAndSubCategory(dto.categoryId, dto.subCategoryId);

    return this.prisma.profile.create({
      data: {
        isDisabled: dto.isDisabled ?? false,
        image: dto.image,
        logo: dto.logo,
        categoryId: dto.categoryId,
        subCategoryId: dto.subCategoryId,
        name: dto.name,
        yearOfEstablishment: dto.yearOfEstablishment,
        address: dto.address ?? {},
        contact: {
          ...(dto.contact ?? {}),
          mostComfortablePreferredLanguages: dto.contact?.mostComfortablePreferredLanguages ?? [],
        },
        workingHours: dto.workingHours ?? {},
        profileCreatedById: actor.sub,
      },
      include: { category: true, subCategory: true },
    });
  }

  async findAll(query: ListProfilesDto) {
    const { page, limit, search, categoryId, subCategoryId, isDisabled } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (categoryId) where['categoryId'] = categoryId;
    if (subCategoryId) where['subCategoryId'] = subCategoryId;
    if (isDisabled !== undefined) where['isDisabled'] = isDisabled;
    if (search) where['name'] = { contains: search, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      this.prisma.profile.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { category: true, subCategory: true },
      }),
      this.prisma.profile.count({ where }),
    ]);
    return paginate(items, total, page, limit);
  }

  async findOne(id: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { id },
      include: { category: true, subCategory: true },
    });
    if (!profile) throw new NotFoundException('Profile not found');
    return profile;
  }

  async update(id: string, dto: UpdateProfileDto) {
    await this.findOne(id);

    const categoryId = dto.categoryId;
    const subCategoryId = dto.subCategoryId;

    if (categoryId || subCategoryId !== undefined) {
      const current = await this.prisma.profile.findUniqueOrThrow({ where: { id } });
      await this.validateCategoryAndSubCategory(
        categoryId ?? current.categoryId,
        subCategoryId !== undefined ? subCategoryId : current.subCategoryId ?? undefined,
      );
    }

    const updateData: Record<string, unknown> = { ...dto };
    if (dto.contact) {
      updateData['contact'] = {
        ...dto.contact,
        mostComfortablePreferredLanguages: dto.contact.mostComfortablePreferredLanguages ?? [],
      };
    }

    // Prisma nested relation updates: convert categoryId/subCategoryId to connect/disconnect
    if ('categoryId' in dto && dto.categoryId) {
      updateData['category'] = { connect: { id: dto.categoryId } };
      delete updateData['categoryId'];
    }

    if ('subCategoryId' in dto) {
      if (dto.subCategoryId) {
        updateData['subCategory'] = { connect: { id: dto.subCategoryId } };
      } else {
        // explicit null/empty provided -> disconnect relation
        updateData['subCategory'] = { disconnect: true };
      }
      delete updateData['subCategoryId'];
    }

    return this.prisma.profile.update({
      where: { id },
      data: updateData,
      include: { category: true, subCategory: true },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.profile.delete({ where: { id } });
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async validateCategoryAndSubCategory(categoryId: string, subCategoryId?: string) {
    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) throw new NotFoundException('Category not found');

    if (subCategoryId) {
      const sub = await this.prisma.subCategory.findUnique({ where: { id: subCategoryId } });
      if (!sub) throw new NotFoundException('Subcategory not found');
      if (sub.categoryId !== categoryId) {
        throw new UnprocessableEntityException('Subcategory does not belong to the specified category');
      }
    }

    if (category.isSubCategoryNeeded && !subCategoryId) {
      throw new UnprocessableEntityException(
        `Profiles in category "${category.name}" must have a subcategory`,
      );
    }
  }
}
