import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PublicService } from './public.service';
import {
  ListPublicCategoriesDto,
  ListPublicSubCategoriesDto,
  ListPublicProfilesDto,
} from './dto/public.dto';

@ApiTags('public')
@Controller({ path: 'public', version: '1' })
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get('category-groups')
  @ApiOperation({ summary: 'Category types (groups) for a profile type, in display order' })
  getCategoryGroups(@Query() query: ListPublicCategoriesDto) {
    return this.publicService.getCategoryGroups(query.type);
  }

  @Get('categories')
  @ApiOperation({ summary: 'All categories by type — no auth required' })
  getCategories(@Query() query: ListPublicCategoriesDto) {
    return this.publicService.getCategories(query.type);
  }

  @Get('categories-with-profiles')
  @ApiOperation({ summary: 'Categories by type only if at least one live profile exists' })
  getCategoriesWithProfiles(@Query() query: ListPublicCategoriesDto) {
    return this.publicService.getCategoriesWithProfiles(query.type);
  }

  @Get('subcategories')
  @ApiOperation({
    summary: 'All subcategories for a category with profile count — no auth required',
  })
  getSubCategories(@Query() query: ListPublicSubCategoriesDto) {
    return this.publicService.getSubCategories(query.categoryId);
  }

  @Get('subcategories-with-profiles')
  @ApiOperation({ summary: 'Subcategories for a category only if at least one live profile exists' })
  getSubCategoriesWithProfiles(@Query() query: ListPublicSubCategoriesDto) {
    return this.publicService.getSubCategoriesWithProfiles(query.categoryId);
  }

  @Get('profiles')
  @ApiOperation({
    summary: 'Live profiles filtered by category/subcategory/city — public card data',
  })
  getProfiles(@Query() query: ListPublicProfilesDto) {
    return this.publicService.getProfiles(
      query.categoryId,
      query.subCategoryId,
      query.city,
      query.isWomenEntrepreneur,
    );
  }

  @Get('profiles/code/:profileCode')
  @ApiOperation({ summary: 'Full profile details by share code — no auth required' })
  getProfileByCode(@Param('profileCode') profileCode: string) {
    return this.publicService.getProfileByCode(profileCode);
  }

  @Get('profiles/:id')
  @ApiOperation({ summary: 'Full profile details — no auth required' })
  getProfile(@Param('id') id: string) {
    return this.publicService.getProfileById(id);
  }
}
