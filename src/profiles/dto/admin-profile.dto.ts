import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsMongoId,
  IsOptional,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CategoryType, ProfileStatus } from '@prisma/client';
import { E164_REGEX, ProfileContentDto } from './profile-content.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class ProfileOwnerDto {
  @ApiProperty({ example: 'owner@example.com', description: 'Login email of the profile owner' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Owner email must be valid' })
  email!: string;

  @ApiProperty({
    example: '+919876543210',
    description: 'Login (WhatsApp) mobile number of the owner',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/[\s\-()]/g, '') : value))
  @Matches(E164_REGEX, {
    message: 'Owner mobile must include the country code, e.g. +919876543210',
  })
  phone!: string;
}

export class AdminCreateProfileDto extends ProfileContentDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDisabled?: boolean;

  @ApiProperty({ type: ProfileOwnerDto })
  @ValidateNested()
  @Type(() => ProfileOwnerDto)
  owner!: ProfileOwnerDto;
}

export class AdminUpdateProfileDto extends ProfileContentDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDisabled?: boolean;

  @ApiPropertyOptional({
    type: ProfileOwnerDto,
    description: 'Only accepted for profiles that have no owner yet',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProfileOwnerDto)
  owner?: ProfileOwnerDto;
}

export class ListProfilesDto extends PaginationDto {
  @ApiPropertyOptional({ enum: CategoryType })
  @IsOptional()
  @IsEnum(CategoryType)
  type?: CategoryType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  subCategoryId?: string;

  @ApiPropertyOptional({ enum: ProfileStatus })
  @IsOptional()
  @IsEnum(ProfileStatus)
  status?: ProfileStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isDisabled?: boolean;
}
