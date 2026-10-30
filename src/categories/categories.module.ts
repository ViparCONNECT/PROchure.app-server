import { Module } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { SubCategoriesService } from './subcategories.service';
import { CategoriesController } from './categories.controller';
import { SubCategoriesController } from './subcategories.controller';
import { CategoryGroupsService } from './category-groups.service';
import { CategoryGroupsController } from './category-groups.controller';

@Module({
  providers: [CategoriesService, SubCategoriesService, CategoryGroupsService],
  controllers: [CategoriesController, SubCategoriesController, CategoryGroupsController],
  exports: [CategoriesService, SubCategoriesService, CategoryGroupsService],
})
export class CategoriesModule {}
