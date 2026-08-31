import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { AdminsService } from './admins.service';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { AdminRole } from '@prisma/client';

@ApiTags('admins')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AdminRole.SUPER_ADMIN)
@Controller({ path: 'admins', version: '1' })
export class AdminsController {
  constructor(private readonly adminsService: AdminsService) {}

  @Get()
  @ApiOperation({ summary: 'List all admins (SUPER_ADMIN)' })
  findAll(@Query() query: PaginationDto) {
    return this.adminsService.findAll(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create admin (SUPER_ADMIN)' })
  create(@Body() dto: CreateAdminDto, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.adminsService.create(dto, user, req.ip ?? '', req.headers['user-agent'] ?? '');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get admin by ID (SUPER_ADMIN)' })
  findOne(@Param('id') id: string) {
    return this.adminsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update admin (SUPER_ADMIN)' })
  update(@Param('id') id: string, @Body() dto: UpdateAdminDto, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.adminsService.update(id, dto, user, req.ip ?? '', req.headers['user-agent'] ?? '');
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete admin (SUPER_ADMIN)' })
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.adminsService.softDelete(id, user, req.ip ?? '', req.headers['user-agent'] ?? '');
  }
}
