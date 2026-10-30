import { Injectable, NotFoundException } from '@nestjs/common';
import { Category, CategoryType, Prisma, ProfileStatus, SubCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_PROFILE_SELECT } from '../profiles/profile-data.service';

/** Only paid/admin-published, enabled profiles are public. */
const LIVE: Prisma.ProfileWhereInput = { status: ProfileStatus.ACTIVE, isDisabled: false };

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  /** Category types (groups) for a profile type, in display order. */
  getCategoryGroups(type: CategoryType) {
    return this.prisma.categoryGroup.findMany({
      where: { type },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, sortOrder: true },
    });
  }

  async getCategories(type: CategoryType) {
    const categories = await this.prisma.category.findMany({
      where: { type },
      orderBy: { name: 'asc' },
      include: { group: { select: { id: true, name: true, sortOrder: true } } },
    });

    return Promise.all(
      categories.map(
        async (
          cat: Category & { group: { id: string; name: string; sortOrder: number } | null },
        ) => {
          const profileCount = await this.prisma.profile.count({
            where: { categoryId: cat.id, ...LIVE },
          });
          const base = {
            id: cat.id,
            name: cat.name,
            urlSlug: cat.urlSlug,
            groupId: cat.groupId,
            group: cat.group,
            profileCount,
          };

          if (cat.isSubCategoryNeeded) {
            const subCategoryCount = await this.prisma.subCategory.count({
              where: { categoryId: cat.id },
            });
            return { ...base, isSubCategoryNeeded: true, subCategoryCount };
          }

          return { ...base, isSubCategoryNeeded: false };
        },
      ),
    );
  }

  async getSubCategories(categoryId: string) {
    // const category = await this.prisma.category.findUnique({ where: { id: categoryId }, orderBy: { name: 'asc' } });
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      include: {
        subCategories: {
          orderBy: { name: 'asc' },
        },
      },
    });
    if (!category) throw new NotFoundException('Category not found');

    const subCategories = await this.prisma.subCategory.findMany({ where: { categoryId } });

    return Promise.all(
      subCategories.map(async (sub: SubCategory) => {
        const profileCount = await this.prisma.profile.count({
          where: { subCategoryId: sub.id, ...LIVE },
        });
        return {
          id: sub.id,
          name: sub.name,
          urlSlug: sub.urlSlug,
          categoryId: sub.categoryId,
          profileCount,
        };
      }),
    );
  }

  // async getProfiles(
  //   categoryId?: string,
  //   subCategoryId?: string,
  //   city?: string,
  //   isWomenEntrepreneur?: boolean,
  // ) {
  //   const where: Record<string, unknown> = { isDisabled: false };
  //   if (categoryId) where['categoryId'] = categoryId;
  //   if (subCategoryId) where['subCategoryId'] = subCategoryId;
  //   // if (isWomenEntrepreneur !== undefined) where['isWomenEntrepreneur'] = isWomenEntrepreneur;
  //   // Filter on embedded address composite type
  //   if (city) {
  //     // For MongoDB composite fields Prisma expects the field value directly (no `contains` operator).
  //     // Use exact match on `address.cityTown`.
  //     where['address'] = { cityTown: city };
  //   }

  //   const profiles = await this.prisma.profile.findMany({
  //     where: where as any,
  //     select: { id: true, image: true },
  //     orderBy: { createdAt: 'desc' },
  //   });

  //   console.log(profiles);

  //   return profiles;
  // }

  async getProfiles(
    categoryId?: string,
    subCategoryId?: string,
    city?: string,
    isWomenEntrepreneur?: boolean,
  ) {
    const where: Prisma.ProfileWhereInput = { ...LIVE };

    if (categoryId) where.categoryId = categoryId;
    if (subCategoryId) where.subCategoryId = subCategoryId;

    // Handled boolean explicitly so 'false' values aren't ignored
    if (isWomenEntrepreneur !== undefined) {
      where.isWomenEntrepreneur = isWomenEntrepreneur;
    }

    if (city) {
      where.address = {
        is: {
          cityTown: city,
        },
      };
    }

    return await this.prisma.profile.findMany({
      where,
      select: PUBLIC_PROFILE_SELECT,
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async getProfileById(id: string) {
    const profile = await this.prisma.profile.findFirst({
      where: { id, ...LIVE },
      select: PUBLIC_PROFILE_SELECT,
    });
    if (!profile) throw new NotFoundException('Profile not found');
    return profile;
  }
}
