import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AddressDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) buildingMallPropertyName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50)  doorShopNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50)  floor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) streetLaneRoadNameSubLocality?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) nearestLandmark?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) secondaryPrimaryLocality?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) cityTown?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) stateProvince?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) country?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20)  pinCodeZipCode?: string;
}
