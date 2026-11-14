import {
  ArrayMaxSize,
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
import { CategoryType, ConsultantKind, ProfileStatus } from '@prisma/client';
import { E164_REGEX } from './profile-content.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const HHMM_MSG = 'time must be in HH:mm (24h) format';
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToUndefined = ({ value }: { value: unknown }) => {
  const v = typeof value === 'string' ? value.trim() : value;
  return v === '' || v === null ? undefined : v;
};
const cleanList =
  (normalize: (s: string) => string) =>
  ({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? [...new Set(value.map((v) => (typeof v === 'string' ? normalize(v) : v)).filter((v) => v !== ''))]
      : value;

export class AdminAddressDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  buildingMallPropertyName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  doorShopNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  floor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  streetLaneRoadNameSubLocality?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  nearestLandmark?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  secondaryPrimaryLocality?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  cityTown?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  stateProvince?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  pinCodeZipCode?: string;
}

export class AdminDayScheduleDto {
  @ApiPropertyOptional({ description: 'Holiday / closed all day' })
  @IsOptional()
  @IsBoolean()
  closed?: boolean;

  @ApiPropertyOptional({ example: '09:00' })
  @ValidateIf((o: AdminDayScheduleDto) => !o.closed && (!!o.open || !!o.close || !!o.breakStart || !!o.breakEnd))
  @Matches(HHMM, { message: `open ${HHMM_MSG}` })
  open?: string | null;

  @ApiPropertyOptional({ example: '18:00' })
  @ValidateIf((o: AdminDayScheduleDto) => !o.closed && (!!o.open || !!o.close || !!o.breakStart || !!o.breakEnd))
  @Matches(HHMM, { message: `close ${HHMM_MSG}` })
  close?: string | null;

  @ApiPropertyOptional({ example: '13:00' })
  @ValidateIf((o: AdminDayScheduleDto) => !o.closed && (!!o.breakStart || !!o.breakEnd))
  @Matches(HHMM, { message: `breakStart ${HHMM_MSG}` })
  breakStart?: string | null;

  @ApiPropertyOptional({ example: '14:00' })
  @ValidateIf((o: AdminDayScheduleDto) => !o.closed && (!!o.breakStart || !!o.breakEnd))
  @Matches(HHMM, { message: `breakEnd ${HHMM_MSG}` })
  breakEnd?: string | null;
}

export class AdminWorkingHoursDto {
  @ApiPropertyOptional({ type: AdminDayScheduleDto, description: 'Monday – Friday' })
  @IsOptional()
  @ValidateNested()
  @Type(() => AdminDayScheduleDto)
  weekdays?: AdminDayScheduleDto;

  @ApiPropertyOptional({ type: AdminDayScheduleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AdminDayScheduleDto)
  saturday?: AdminDayScheduleDto;

  @ApiPropertyOptional({ type: AdminDayScheduleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AdminDayScheduleDto)
  sunday?: AdminDayScheduleDto;
}

export class AdminProfileContentDto {
  @ApiPropertyOptional({ enum: CategoryType })
  @IsOptional()
  @IsEnum(CategoryType)
  profileType?: CategoryType;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsMongoId()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsMongoId()
  subCategoryId?: string;

  @ApiPropertyOptional({ enum: ConsultantKind })
  @IsOptional()
  @IsEnum(ConsultantKind)
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
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(200)
  degrees?: string;

  @ApiPropertyOptional({ description: 'Statutory body registration number (independent only)' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(100)
  registrationNumber?: string;

  @ApiPropertyOptional({ description: 'Optional GSTIN for billing / invoice support' })
  @IsOptional()
  @Transform(({ value }) => {
    const normalized = typeof value === 'string' ? value.trim() : value;
    if (normalized === '' || normalized === null || normalized === undefined) return undefined;
    return normalized.toUpperCase();
  })
  @IsString()
  @Matches(/^$|^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i, {
    message: 'GSTIN must be a valid 15-character GSTIN number',
  })
  @MaxLength(15, { message: 'GSTIN must be 15 characters or fewer' })
  gstin?: string;

  @ApiPropertyOptional({ description: 'Core / primary services offered / areas of practice (shown on the card)' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(80, { message: 'Core services must be 80 characters or fewer' })
  servicesOffered?: string;

  @ApiPropertyOptional({ description: 'All services offered / areas of practice in detail (profile popup only)' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(2000)
  servicesDetail?: string;

  @ApiPropertyOptional({ example: '2012', description: 'Practicing since / established in / serving since' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  sinceYear?: string;

  @ApiPropertyOptional({ default: false, description: 'SHE-PRO badge' })
  @IsOptional()
  @IsBoolean()
  isWomenEntrepreneur?: boolean;

  @ApiPropertyOptional({ type: [String], example: ['+919876543210'] })
  @IsOptional()
  @Transform(cleanList((s) => s.replace(/[\s\-()]/g, '')))
  @IsArray()
  @ArrayMaxSize(3)
  @Matches(E164_REGEX, {
    each: true,
    message: 'Each contact number must include the country code, e.g. +919876543210',
  })
  contactNumbers?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(cleanList((s) => s.trim().toLowerCase()))
  @IsArray()
  @ArrayMaxSize(3)
  @IsEmail({}, { each: true, message: 'Each email ID must be valid' })
  emails?: string[];

  @ApiPropertyOptional({ type: AdminAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AdminAddressDto)
  address?: AdminAddressDto;

  @ApiPropertyOptional({ type: AdminWorkingHoursDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AdminWorkingHoursDto)
  workingHours?: AdminWorkingHoursDto;

  @ApiPropertyOptional({ type: [String], example: ['English', 'Hindi'] })
  @IsOptional()
  @Transform(cleanList((s) => s.trim()))
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  languages?: string[];
}

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

export class AdminCreateProfileDto extends AdminProfileContentDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDisabled?: boolean;

  @ApiProperty({ type: ProfileOwnerDto })
  @ValidateNested()
  @Type(() => ProfileOwnerDto)
  owner!: ProfileOwnerDto;
}

export class AdminUpdateProfileDto extends AdminProfileContentDto {
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
