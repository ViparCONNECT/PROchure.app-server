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

  async getCategoriesWithProfiles(type: CategoryType) {
    const categories = await this.getCategories(type);
    return categories.filter((category) => category.profileCount > 0);
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

    const subCategories = await this.prisma.subCategory.findMany({
      where: { categoryId },
      orderBy: { name: 'asc' },
    });

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

  async getSubCategoriesWithProfiles(categoryId: string) {
    const subCategories = await this.getSubCategories(categoryId);
    return subCategories.filter((subcategory) => subcategory.profileCount > 0);
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
    await this.ensureLegacyProfileCodes();

    const where: Prisma.ProfileWhereInput = {
      ...LIVE,
      profileCode: { not: '' },
    } as any;

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

    const profiles = await this.prisma.profile.findMany({
      where,
      select: PUBLIC_PROFILE_SELECT,
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return profiles.filter((profile) => !!profile.profileCode);
  }

  async getProfileById(id: string): Promise<any> {
    const profile = await this.prisma.profile.findFirst({
      where: { id, ...LIVE, profileCode: { not: '' } } as any,
      select: PUBLIC_PROFILE_SELECT,
    });
    if (!profile || !profile.profileCode) {
      const legacy = await this.prisma.profile.findUnique({ where: { id } as any });
      if (!legacy || !legacy.profileCode) throw new NotFoundException('Profile not found');
      const profileCode = await this.generateUniqueProfileCode();
      await this.prisma.profile.update({ where: { id }, data: { profileCode } as any });
      return this.getProfileById(id);
    }
    return profile;
  }

  async getProfileByCode(profileCode: string) {
    const normalized = profileCode.trim().toUpperCase();
    const profile = await this.prisma.profile.findFirst({
      where: { ...LIVE, profileCode: { equals: normalized, not: '' } } as any,
      select: PUBLIC_PROFILE_SELECT as any,
    });
    if (!profile || !profile.profileCode) throw new NotFoundException('Profile not found');
    return profile;
  }

  private async ensureLegacyProfileCodes() {
    const result = await this.prisma.$runCommandRaw({
      find: 'Profile',
      filter: {
        $or: [
          { profileCode: null },
          { profileCode: '' },
          { profileCode: { $exists: false } },
        ],
      },
      projection: { _id: 1, profileCode: 1 },
    } as any) as any;

    const legacy = (result?.cursor?.firstBatch ?? []).map((profile: any) => {
      const id = profile?._id && typeof profile._id === 'object' && profile._id.$oid
        ? profile._id.$oid
        : typeof profile?._id === 'string'
          ? profile._id
          : String(profile?._id ?? '');

      return { id };
    });

    for (const profile of legacy) {
      const profileCode = await this.generateUniqueProfileCode();
      await this.prisma.profile.update({
        where: { id: profile.id },
        data: { profileCode },
      });
    }
  }

  private async generateUniqueProfileCode(): Promise<string> {
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
}
