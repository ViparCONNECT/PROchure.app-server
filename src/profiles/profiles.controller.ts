import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { ProfilesService } from './profiles.service';
import {
  AdminCreateProfileDto,
  AdminUpdateProfileDto,
  ListProfilesDto,
} from './dto/admin-profile.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

@ApiTags('profiles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
@Controller({ path: 'profiles', version: '1' })
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get()
  @ApiOperation({ summary: 'List profiles (paginated, filterable)' })
  findAll(@Query() query: ListProfilesDto) {
    return this.profilesService.findAll(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create profile and its owner login (no payment, live immediately)' })
  create(@Body() dto: AdminCreateProfileDto, @CurrentUser() user: JwtPayload) {
    return this.profilesService.create(dto, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get profile by ID' })
  findOne(@Param('id') id: string) {
    return this.profilesService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Replace profile content' })
  update(@Param('id') id: string, @Body() dto: AdminUpdateProfileDto) {
    return this.profilesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete profile (hard delete)' })
  remove(@Param('id') id: string) {
    return this.profilesService.remove(id);
  }
}
