import { IsArray, IsEmail, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ContactDto {
  @ApiPropertyOptional({ example: '+91' }) @IsOptional() @IsString() @MaxLength(10)  countryCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20)  officialContactNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(255) officialEmailId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) officialWebsiteApp?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) contactPersonName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) contactPersonDesignation?: string;

  @ApiPropertyOptional({ type: [String], example: ['English', 'Hindi'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mostComfortablePreferredLanguages?: string[];
}
