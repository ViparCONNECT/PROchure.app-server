import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CategoryType, ConsultantKind } from '@prisma/client';
import { AddressDto } from './address.dto';
import { WorkingHoursDto } from './working-hours.dto';

export const E164_REGEX = /^\+[1-9]\d{7,14}$/;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToUndefined = ({ value }: { value: unknown }) => {
  const v = typeof value === 'string' ? value.trim() : value;
  return v === '' || v === null ? undefined : v;
};
const cleanList =
  (normalize: (s: string) => string) =>
  ({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? [
          ...new Set(
            value.map((v) => (typeof v === 'string' ? normalize(v) : v)).filter((v) => v !== ''),
          ),
        ]
      : value;

const isConsultant = (o: ProfileContentDto) =>
  o.profileType === CategoryType.PROFESSIONAL_CONSULTANT;
const isIndependent = (o: ProfileContentDto) =>
  isConsultant(o) && o.consultantKind === ConsultantKind.INDEPENDENT;

/** Profile content shared by the admin panel and the self-service (user) form. */
export class ProfileContentDto {
  @ApiProperty({
    enum: CategoryType,
    description: 'Which form was used; must match the category type',
  })
  @IsEnum(CategoryType)
  profileType!: CategoryType;

  @ApiProperty()
  @IsMongoId()
  categoryId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsMongoId()
  subCategoryId?: string;

  @ApiPropertyOptional({
    enum: ConsultantKind,
    description: 'Required for PROFESSIONAL_CONSULTANT',
  })
  @ValidateIf(isConsultant)
  @IsEnum(ConsultantKind, {
    message: 'Please choose Independent Professional or Professional Consultancy',
  })
  consultantKind?: ConsultantKind;

  @ApiProperty({ description: 'Name / Name of entity / Name of service or retail brand' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ description: 'Consultancy only' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(150)
  consultantName?: string;

  @ApiPropertyOptional({ description: 'Required for independent professionals' })
  @ValidateIf(isIndependent)
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Degrees are required' })
  @MaxLength(200)
  degrees?: string;

  @ApiPropertyOptional({ description: 'Statutory body registration number (independent only)' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(100)
  registrationNumber?: string;

  @ApiProperty({
    description: 'Core / primary services offered / areas of practice (shown on the card)',
  })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80, { message: 'Core services must be 80 characters or fewer' })
  servicesOffered!: string;

  @ApiPropertyOptional({
    description: 'All services offered / areas of practice in detail (profile popup only)',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(2000)
  servicesDetail?: string;

  @ApiProperty({
    example: '2012',
    description: 'Practicing since / established in / serving since',
  })
  @Transform(trim)
  @Matches(/^(19|20)\d{2}$/, { message: 'Enter a valid 4-digit year' })
  sinceYear!: string;

  @ApiPropertyOptional({ default: false, description: 'SHE-PRO badge' })
  @IsOptional()
  @IsBoolean()
  isWomenEntrepreneur?: boolean;

  @ApiProperty({ type: [String], example: ['+919876543210'] })
  @Transform(cleanList((s) => s.replace(/[\s\-()]/g, '')))
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one contact number is required' })
  @ArrayMaxSize(3)
  @Matches(E164_REGEX, {
    each: true,
    message: 'Each contact number must include the country code, e.g. +919876543210',
  })
  contactNumbers!: string[];

  @ApiProperty({ type: [String] })
  @Transform(cleanList((s) => s.trim().toLowerCase()))
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one email ID is required' })
  @ArrayMaxSize(3)
  @IsEmail({}, { each: true, message: 'Each email ID must be valid' })
  emails!: string[];

  @ApiProperty({ type: AddressDto })
  @ValidateNested()
  @Type(() => AddressDto)
  address!: AddressDto;

  @ApiProperty({ type: WorkingHoursDto })
  @ValidateNested()
  @Type(() => WorkingHoursDto)
  workingHours!: WorkingHoursDto;

  @ApiProperty({ type: [String], example: ['English', 'Hindi'] })
  @Transform(cleanList((s) => s.trim()))
  @IsArray()
  @ArrayMinSize(1, { message: 'Select at least one preferred language' })
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  languages!: string[];
}
