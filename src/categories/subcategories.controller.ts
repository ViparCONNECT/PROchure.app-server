import {
  Controller, Patch, Delete, Body, Param,
  HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { SubCategoriesService } from './subcategories.service';
import { UpdateSubCategoryDto } from './dto/update-subcategory.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminRole } from '@prisma/client';

@ApiTags('subcategories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
@Controller({ path: 'subcategories', version: '1' })
export class SubCategoriesController {
  constructor(private readonly subCategoriesService: SubCategoriesService) {}

  @Patch(':id')
  @ApiOperation({ summary: 'Update subcategory' })
  update(@Param('id') id: string, @Body() dto: UpdateSubCategoryDto) {
    return this.subCategoriesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete subcategory (hard delete, blocked if profiles exist)' })
  remove(@Param('id') id: string) {
    return this.subCategoriesService.remove(id);
  }
}
