import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { CategoryType, ConsultantKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileContentDto } from './dto/profile-content.dto';
import { DayScheduleDto } from './dto/working-hours.dto';

export const PROFILE_INCLUDE = {
  category: {
    select: { id: true, name: true, type: true, urlSlug: true, isSubCategoryNeeded: true },
  },
  subCategory: { select: { id: true, name: true, urlSlug: true } },
} satisfies Prisma.ProfileInclude;

/** Fields that are safe to expose publicly (no owner/admin/legacy data). */
export const PUBLIC_PROFILE_SELECT = {
  id: true,
  categoryId: true,
  subCategoryId: true,
  consultantKind: true,
  name: true,
  consultantName: true,
  degrees: true,
  registrationNumber: true,
  servicesOffered: true,
  sinceYear: true,
  isWomenEntrepreneur: true,
  contactNumbers: true,
  emails: true,
  address: true,
  workingHours: true,
  languages: true,
  publishedAt: true,
  ...PROFILE_INCLUDE,
} satisfies Prisma.ProfileSelect;

export type ProfileContentData = Pick<
  Prisma.ProfileUncheckedCreateInput,
  | 'categoryId'
  | 'subCategoryId'
  | 'consultantKind'
  | 'name'
  | 'consultantName'
  | 'degrees'
  | 'registrationNumber'
  | 'servicesOffered'
  | 'sinceYear'
  | 'isWomenEntrepreneur'
  | 'contactNumbers'
  | 'emails'
  | 'address'
  | 'workingHours'
  | 'languages'
>;

/** Validates profile content against its category and converts it to Prisma data. */
@Injectable()
export class ProfileDataService {
  constructor(private readonly prisma: PrismaService) {}

  async toData(dto: ProfileContentDto): Promise<ProfileContentData> {
    await this.validateCategory(dto.profileType, dto.categoryId, dto.subCategoryId);

    if (parseInt(dto.sinceYear, 10) > new Date().getFullYear()) {
      throw new UnprocessableEntityException('The year cannot be in the future');
    }

    const kind =
      dto.profileType === CategoryType.PROFESSIONAL_CONSULTANT ? dto.consultantKind! : null;
    const independent = kind === ConsultantKind.INDEPENDENT;

    return {
      categoryId: dto.categoryId,
      subCategoryId: dto.subCategoryId ?? null,
      consultantKind: kind,
      name: dto.name,
      consultantName: kind === ConsultantKind.CONSULTANCY ? (dto.consultantName ?? null) : null,
      degrees: independent ? (dto.degrees ?? null) : null,
      registrationNumber: independent ? (dto.registrationNumber ?? null) : null,
      servicesOffered: dto.servicesOffered,
      sinceYear: dto.sinceYear,
      isWomenEntrepreneur: dto.isWomenEntrepreneur ?? false,
      contactNumbers: dto.contactNumbers,
      emails: dto.emails,
      address: { ...dto.address },
      workingHours: {
        weekdays: this.toSchedule(dto.workingHours.weekdays, 'Monday – Friday'),
        saturday: this.toSchedule(dto.workingHours.saturday, 'Saturday'),
        sunday: this.toSchedule(dto.workingHours.sunday, 'Sunday'),
      },
      languages: dto.languages,
    };
  }

  private async validateCategory(type: CategoryType, categoryId: string, subCategoryId?: string) {
    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) throw new NotFoundException('Category not found');
    if (category.type !== type) {
      throw new UnprocessableEntityException(
        'The selected category does not belong to this profile type',
      );
    }

    if (subCategoryId) {
      const sub = await this.prisma.subCategory.findUnique({ where: { id: subCategoryId } });
      if (!sub) throw new NotFoundException('Subcategory not found');
      if (sub.categoryId !== categoryId) {
        throw new UnprocessableEntityException(
          'Subcategory does not belong to the specified category',
        );
      }
    } else if (category.isSubCategoryNeeded) {
      throw new UnprocessableEntityException(`Please select a subcategory for "${category.name}"`);
    }
  }

  private toSchedule(day: DayScheduleDto, label: string) {
    if (day.closed)
      return { closed: true, open: null, close: null, breakStart: null, breakEnd: null };

    const { open, close } = day as Required<DayScheduleDto>;
    const hasBreak = !!day.breakStart && !!day.breakEnd;
    if (open! >= close!)
      throw new UnprocessableEntityException(`${label}: closing time must be after opening time`);
    if (
      hasBreak &&
      !(open! < day.breakStart! && day.breakStart! < day.breakEnd! && day.breakEnd! < close!)
    ) {
      throw new UnprocessableEntityException(`${label}: lunch break must be within working hours`);
    }
    return {
      closed: false,
      open,
      close,
      breakStart: hasBreak ? day.breakStart! : null,
      breakEnd: hasBreak ? day.breakEnd! : null,
    };
  }
}
