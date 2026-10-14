import { IsBoolean, Matches, ValidateIf, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const HHMM_MSG = 'time must be in HH:mm (24h) format';

export class DayScheduleDto {
  @ApiProperty({ description: 'Holiday / closed all day' })
  @IsBoolean()
  closed!: boolean;

  @ApiPropertyOptional({ example: '09:00' })
  @ValidateIf((o: DayScheduleDto) => !o.closed)
  @Matches(HHMM, { message: `open ${HHMM_MSG}` })
  open?: string | null;

  @ApiPropertyOptional({ example: '18:00' })
  @ValidateIf((o: DayScheduleDto) => !o.closed)
  @Matches(HHMM, { message: `close ${HHMM_MSG}` })
  close?: string | null;

  @ApiPropertyOptional({ example: '13:00' })
  @ValidateIf((o: DayScheduleDto) => !o.closed && (!!o.breakStart || !!o.breakEnd))
  @Matches(HHMM, { message: `breakStart ${HHMM_MSG}` })
  breakStart?: string | null;

  @ApiPropertyOptional({ example: '14:00' })
  @ValidateIf((o: DayScheduleDto) => !o.closed && (!!o.breakStart || !!o.breakEnd))
  @Matches(HHMM, { message: `breakEnd ${HHMM_MSG}` })
  breakEnd?: string | null;
}

export class WorkingHoursDto {
  @ApiProperty({ type: DayScheduleDto, description: 'Monday – Friday' })
  @ValidateNested()
  @Type(() => DayScheduleDto)
  weekdays!: DayScheduleDto;

  @ApiProperty({ type: DayScheduleDto })
  @ValidateNested()
  @Type(() => DayScheduleDto)
  saturday!: DayScheduleDto;

  @ApiProperty({ type: DayScheduleDto })
  @ValidateNested()
  @Type(() => DayScheduleDto)
  sunday!: DayScheduleDto;
}
