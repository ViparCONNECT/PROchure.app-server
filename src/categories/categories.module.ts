import { Module } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { SubCategoriesService } from './subcategories.service';
import { CategoriesController } from './categories.controller';
import { SubCategoriesController } from './subcategories.controller';

@Module({
  providers: [CategoriesService, SubCategoriesService],
  controllers: [CategoriesController, SubCategoriesController],
  exports: [CategoriesService, SubCategoriesService],
})
export class CategoriesModule {}
