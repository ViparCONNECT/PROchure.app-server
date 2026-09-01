import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

export class GetSignedUrlDto {
  @ApiProperty({ example: 'profile-photo.jpg' })
  @IsString()
  @MaxLength(200)
  fileName!: string;

  @ApiProperty({ enum: ALLOWED_TYPES, example: 'image/jpeg' })
  @IsIn(ALLOWED_TYPES)
  fileType!: string;

  @ApiPropertyOptional({ example: 'profiles', description: 'S3 folder prefix' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  folder?: string;
}
