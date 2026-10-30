import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CategoryGroupsService } from './category-groups.service';
import {
  CreateCategoryGroupDto,
  ListCategoryGroupsDto,
  UpdateCategoryGroupDto,
} from './dto/category-group.dto';

@ApiTags('category-groups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
@Controller({ path: 'category-groups', version: '1' })
export class CategoryGroupsController {
  constructor(private readonly groups: CategoryGroupsService) {}

  @Get()
  @ApiOperation({ summary: 'List category types (with category counts)' })
  findAll(@Query() query: ListCategoryGroupsDto) {
    return this.groups.findAll(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create category type' })
  create(@Body() dto: CreateCategoryGroupDto) {
    return this.groups.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename / reorder category type' })
  update(@Param('id') id: string, @Body() dto: UpdateCategoryGroupDto) {
    return this.groups.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete category type (blocked while it has categories)' })
  remove(@Param('id') id: string) {
    return this.groups.remove(id);
  }
}
