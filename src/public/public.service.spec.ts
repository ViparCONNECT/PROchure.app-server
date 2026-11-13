import { Test } from '@nestjs/testing';
import { CategoryType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PublicService } from './public.service';

const prisma = {
  category: { findMany: jest.fn(), findUnique: jest.fn() },
  subCategory: { findMany: jest.fn(), count: jest.fn() },
  profile: { count: jest.fn() },
  categoryGroup: { findMany: jest.fn() },
};

describe('PublicService', () => {
  let service: PublicService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [PublicService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(PublicService);
  });

  it('getCategoriesWithProfiles only returns categories that have at least one live profile', async () => {
    prisma.category.findMany.mockResolvedValue([
      {
        id: 'cat-1',
        name: 'Category 1',
        urlSlug: 'category-1',
        groupId: 'group-1',
        group: { id: 'group-1', name: 'Group 1', sortOrder: 1 },
        isSubCategoryNeeded: false,
      },
      {
        id: 'cat-2',
        name: 'Category 2',
        urlSlug: 'category-2',
        groupId: 'group-1',
        group: { id: 'group-1', name: 'Group 1', sortOrder: 1 },
        isSubCategoryNeeded: true,
      },
      {
        id: 'cat-3',
        name: 'Category 3',
        urlSlug: 'category-3',
        groupId: 'group-2',
        group: { id: 'group-2', name: 'Group 2', sortOrder: 2 },
        isSubCategoryNeeded: false,
      },
    ]);

    prisma.profile.count.mockImplementation(async ({ where }: any) => {
      const categoryId = where.categoryId;
      if (categoryId === 'cat-1') return 1;
      if (categoryId === 'cat-3') return 2;
      return 0;
    });
    prisma.subCategory.count.mockResolvedValue(0);

    const result = await service.getCategoriesWithProfiles(CategoryType.PROFESSIONAL_CONSULTANT);

    expect(result.map((category) => category.id)).toEqual(['cat-1', 'cat-3']);
  });

  it('getSubCategoriesWithProfiles only returns subcategories that have at least one live profile', async () => {
    prisma.category.findUnique.mockResolvedValue({
      id: 'cat-1',
      subCategories: [
        { id: 'sub-1', name: 'Sub 1', urlSlug: 'sub-1', categoryId: 'cat-1' },
        { id: 'sub-2', name: 'Sub 2', urlSlug: 'sub-2', categoryId: 'cat-1' },
      ],
    });
    prisma.subCategory.findMany.mockResolvedValue([
      { id: 'sub-1', name: 'Sub 1', urlSlug: 'sub-1', categoryId: 'cat-1' },
      { id: 'sub-2', name: 'Sub 2', urlSlug: 'sub-2', categoryId: 'cat-1' },
    ]);

    prisma.profile.count.mockImplementation(async ({ where }: any) => {
      if (where.subCategoryId === 'sub-1') return 1;
      return 0;
    });

    const result = await service.getSubCategoriesWithProfiles('cat-1');

    expect(result.map((subcategory) => subcategory.id)).toEqual(['sub-1']);
  });
});
