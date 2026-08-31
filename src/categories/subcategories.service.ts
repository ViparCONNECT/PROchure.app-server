import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubCategoryDto } from './dto/create-subcategory.dto';
import { UpdateSubCategoryDto } from './dto/update-subcategory.dto';
import { PaginationDto, paginate } from '../common/dto/pagination.dto';
import { generateSlug } from '../common/utils/slug.util';

@Injectable()
export class SubCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(categoryId: string, dto: CreateSubCategoryDto) {
    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) throw new NotFoundException('Category not found');

    const existing = await this.prisma.subCategory.findUnique({
      where: { categoryId_name: { categoryId, name: dto.name } },
    });
    if (existing) throw new ConflictException('Subcategory with this name already exists in the category');

    return this.prisma.subCategory.create({ data: { name: dto.name, urlSlug: await this.uniqueSlugForCategory(generateSlug(dto.name), categoryId), categoryId } });
  }

  async findAll(categoryId: string, query: PaginationDto) {
    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) throw new NotFoundException('Category not found');

    const { page, limit, search } = query;
    const skip = (page - 1) * limit;
    const where = {
      categoryId,
      ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.subCategory.findMany({ where, skip, take: limit, orderBy: { name: 'asc' } }),
      this.prisma.subCategory.count({ where }),
    ]);
    return paginate(items, total, page, limit);
  }

  async findOne(id: string) {
    const sub = await this.prisma.subCategory.findUnique({ where: { id }, include: { category: true } });
    if (!sub) throw new NotFoundException('Subcategory not found');
    return sub;
  }

  async update(id: string, dto: UpdateSubCategoryDto) {
    const sub = await this.findOne(id);
    if (dto.name) {
      const conflict = await this.prisma.subCategory.findUnique({
        where: { categoryId_name: { categoryId: sub.categoryId, name: dto.name } },
      });
      if (conflict && conflict.id !== id) throw new ConflictException('Name already taken in this category');
    }
    const updateData: Record<string, unknown> = { ...dto };
    if (dto.name) updateData['urlSlug'] = await this.uniqueSlugForCategory(generateSlug(dto.name), sub.categoryId, id);
    return this.prisma.subCategory.update({ where: { id }, data: updateData });
  }

  // Returns a slug unique within the given category, appending -2/-3/... on collision
  private async uniqueSlugForCategory(base: string, categoryId: string, excludeId?: string): Promise<string> {
    let slug = base;
    let n = 1;
    while (true) {
      const conflict = await this.prisma.subCategory.findFirst({
        where: { categoryId, urlSlug: slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      });
      if (!conflict) return slug;
      n += 1;
      slug = `${base}-${n}`;
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    const profileCount = await this.prisma.profile.count({ where: { subCategoryId: id } });
    if (profileCount > 0) throw new ConflictException('Cannot delete subcategory with existing profiles');
    await this.prisma.subCategory.delete({ where: { id } });
  }
}
