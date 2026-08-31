import { IsEnum, IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { CategoryType } from '@prisma/client';

export class ListPublicCategoriesDto {
  @ApiProperty({ enum: CategoryType })
  @IsEnum(CategoryType)
  type!: CategoryType;
}

export class ListPublicSubCategoriesDto {
  @ApiProperty()
  @IsMongoId()
  categoryId!: string;
}

export class ListPublicProfilesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  subCategoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;
}
