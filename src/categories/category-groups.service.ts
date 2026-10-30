import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CategoryType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCategoryGroupDto,
  ListCategoryGroupsDto,
  UpdateCategoryGroupDto,
} from './dto/category-group.dto';

/** Admin management of "Category Types" (groups of categories within a profile type). */
@Injectable()
export class CategoryGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: ListCategoryGroupsDto) {
    return this.prisma.categoryGroup.findMany({
      where: query.type ? { type: query.type } : {},
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { categories: true } } },
    });
  }

  async create(dto: CreateCategoryGroupDto) {
    try {
      return await this.prisma.categoryGroup.create({
        data: { name: dto.name, type: dto.type, sortOrder: dto.sortOrder ?? 0 },
      });
    } catch (err) {
      throw this.mapUnique(err);
    }
  }

  async update(id: string, dto: UpdateCategoryGroupDto) {
    await this.findOne(id);
    try {
      return await this.prisma.categoryGroup.update({ where: { id }, data: dto });
    } catch (err) {
      throw this.mapUnique(err);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    const count = await this.prisma.category.count({ where: { groupId: id } });
    if (count > 0) {
      throw new ConflictException('Move or delete the categories in this category type first');
    }
    await this.prisma.categoryGroup.delete({ where: { id } });
  }

  async findOne(id: string) {
    const group = await this.prisma.categoryGroup.findUnique({ where: { id } });
    if (!group) throw new NotFoundException('Category type not found');
    return group;
  }

  /** Ensures a group exists and belongs to the given profile type. */
  async assertBelongsTo(groupId: string, type: CategoryType) {
    const group = await this.findOne(groupId);
    if (group.type !== type) {
      throw new UnprocessableEntityException(
        'The category type does not belong to this profile type',
      );
    }
    return group;
  }

  private mapUnique(err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new ConflictException('A category type with this name already exists');
    }
    return err;
  }
}
