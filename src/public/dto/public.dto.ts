import { IsEnum, IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
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

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    const v = String(value).toLowerCase();
    if (v === 'true') return true;
    if (v === 'false') return false;
    return value;
  })
  @IsBoolean()
  isWomenEntrepreneur?: boolean;
}
