import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { GSTIN_REGEX } from '../../profiles/dto/profile-content.dto';

export class UpdateGstinDto {
  @ApiPropertyOptional({
    description: 'GSTIN for billing / invoice support',
    example: '27ABCDE1234F1Z5',
    nullable: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim();
    return normalized === '' ? null : normalized.toUpperCase();
  })
  @IsString({ message: 'GSTIN must be a valid GSTIN string' })
  @Matches(GSTIN_REGEX, { message: 'GSTIN must be a valid 15-character GSTIN number' })
  @MaxLength(15, { message: 'GSTIN must be 15 characters or fewer' })
  gstin?: string | null;
}
