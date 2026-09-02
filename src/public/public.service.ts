import { Injectable, NotFoundException } from '@nestjs/common';
import { Category, CategoryType, SubCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  async getCategories(type: CategoryType) {
    const categories = await this.prisma.category.findMany({ where: { type } });

    return Promise.all(
      categories.map(async (cat: Category) => {
        const profileCount = await this.prisma.profile.count({
          where: { categoryId: cat.id, isDisabled: false },
        });

        if (cat.isSubCategoryNeeded) {
          const subCategoryCount = await this.prisma.subCategory.count({
            where: { categoryId: cat.id },
          });
          return { id: cat.id, name: cat.name, urlSlug: cat.urlSlug, isSubCategoryNeeded: true, subCategoryCount, profileCount };
        }

        return { id: cat.id, name: cat.name, urlSlug: cat.urlSlug, isSubCategoryNeeded: false, profileCount };
      }),
    );
  }

  async getSubCategories(categoryId: string) {
    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) throw new NotFoundException('Category not found');

    const subCategories = await this.prisma.subCategory.findMany({ where: { categoryId } });

    return Promise.all(
      subCategories.map(async (sub: SubCategory) => {
        const profileCount = await this.prisma.profile.count({
          where: { subCategoryId: sub.id, isDisabled: false },
        });
        return { id: sub.id, name: sub.name, urlSlug: sub.urlSlug, categoryId: sub.categoryId, profileCount };
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
  const where: any = { isDisabled: false };

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
    select: { id: true, image: true },
    orderBy: { createdAt: 'desc' },
  });
}

  async getProfileById(id: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { id },
      include: { category: true, subCategory: true },
    });
    if (!profile) throw new NotFoundException('Profile not found');
    if (profile.isDisabled) throw new NotFoundException('Profile not found');
    return profile;
  }
}
