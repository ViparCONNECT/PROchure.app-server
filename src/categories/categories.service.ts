import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ListCategoriesDto } from './dto/list-categories.dto';
import { PaginationDto, paginate } from '../common/dto/pagination.dto';
import { generateSlug } from '../common/utils/slug.util';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto) {
    const slug = await this.uniqueSlugForType(generateSlug(dto.name), dto.type);
    return this.prisma.category.create({
      data: { name: dto.name, urlSlug: slug, type: dto.type, isSubCategoryNeeded: dto.isSubCategoryNeeded ?? false },
    });
  }

  async findAll(query: ListCategoriesDto) {
    const { page, limit, search, type } = query;
    const skip = (page - 1) * limit;
    const where = {
      ...(type ? { type } : {}),
      ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.category.findMany({ where, skip, take: limit, orderBy: { name: 'asc' } }),
      this.prisma.category.count({ where }),
    ]);
    return paginate(items, total, page, limit);
  }

  async findOne(id: string) {
    const cat = await this.prisma.category.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('Category not found');
    return cat;
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const current = await this.findOne(id);
    const data: Record<string, unknown> = { ...dto };
    if (dto.name) {
      data['urlSlug'] = await this.uniqueSlugForType(generateSlug(dto.name), current.type, id);
    }
    return this.prisma.category.update({ where: { id }, data });
  }

  // Returns a slug unique within the given type, appending -2/-3/... on collision
  private async uniqueSlugForType(base: string, type: import('@prisma/client').CategoryType, excludeId?: string): Promise<string> {
    let slug = base;
    let n = 1;
    while (true) {
      const conflict = await this.prisma.category.findFirst({
        where: { type, urlSlug: slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      });
      if (!conflict) return slug;
      n += 1;
      slug = `${base}-${n}`;
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    const profileCount = await this.prisma.profile.count({ where: { categoryId: id } });
    if (profileCount > 0) throw new ConflictException('Cannot delete category with existing profiles');
    const subCount = await this.prisma.subCategory.count({ where: { categoryId: id } });
    if (subCount > 0) throw new ConflictException('Cannot delete category with existing subcategories');
    await this.prisma.category.delete({ where: { id } });
  }
}
