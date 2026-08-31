import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { SubCategoriesService } from './subcategories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateSubCategoryDto } from './dto/create-subcategory.dto';
import { UpdateSubCategoryDto } from './dto/update-subcategory.dto';
import { ListCategoriesDto } from './dto/list-categories.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { AdminRole } from '@prisma/client';

@ApiTags('categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
@Controller({ path: 'categories', version: '1' })
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly subCategoriesService: SubCategoriesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List categories' })
  findAll(@Query() query: ListCategoriesDto) {
    return this.categoriesService.findAll(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create category' })
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update category' })
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete category (hard delete, blocked if profiles exist)' })
  remove(@Param('id') id: string) {
    return this.categoriesService.remove(id);
  }

  // ─── Subcategory endpoints nested under /categories/:categoryId/subcategories ─

  @Get(':categoryId/subcategories')
  @ApiOperation({ summary: 'List subcategories for a category' })
  listSubs(@Param('categoryId') categoryId: string, @Query() query: PaginationDto) {
    return this.subCategoriesService.findAll(categoryId, query);
  }

  @Post(':categoryId/subcategories')
  @ApiOperation({ summary: 'Create subcategory under a category' })
  createSub(@Param('categoryId') categoryId: string, @Body() dto: CreateSubCategoryDto) {
    return this.subCategoriesService.create(categoryId, dto);
  }
}
