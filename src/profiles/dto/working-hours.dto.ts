import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class WorkingHoursDto {
  @ApiPropertyOptional({ example: '09:00 AM to 01:00 PM | Lunch Break | 02:00 PM to 07:00 PM' })
  @IsOptional() @IsString() @MaxLength(200) monday?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) tuesday?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) wednesday?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) thursday?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) friday?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) saturday?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) sunday?: string;
}
