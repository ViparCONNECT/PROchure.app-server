import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { CategoryType, ConsultantKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileContentDto } from './dto/profile-content.dto';
import { DayScheduleDto } from './dto/working-hours.dto';

export const PROFILE_INCLUDE = {
  category: {
    select: {
      id: true,
      name: true,
      type: true,
      urlSlug: true,
      isSubCategoryNeeded: true,
      groupId: true,
    },
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
  profileCode: true,
  consultantName: true,
  degrees: true,
  registrationNumber: true,
  gstin: true,
  servicesOffered: true,
  servicesDetail: true,
  sinceYear: true,
  isWomenEntrepreneur: true,
  contactNumbers: true,
  emails: true,
  address: true,
  workingHours: true,
  languages: true,
  publishedAt: true,
  ...PROFILE_INCLUDE,
} as const;

export type ProfileContentData = Pick<
  Prisma.ProfileUncheckedCreateInput,
  | 'categoryId'
  | 'subCategoryId'
  | 'consultantKind'
  | 'name'
  | 'consultantName'
  | 'degrees'
  | 'registrationNumber'
  | 'gstin'
  | 'servicesOffered'
  | 'servicesDetail'
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

  isProfileComplete(profile: Partial<ProfileContentData> & {
    category?: { type?: CategoryType | null } | null;
  }): boolean {
    if (!profile) return false;

    const type = profile.category?.type ?? null;
    const kind = type === CategoryType.PROFESSIONAL_CONSULTANT ? profile.consultantKind ?? null : null;
    const independent = kind === ConsultantKind.INDEPENDENT;
    const name = String(profile.name ?? '').trim();
    const servicesOffered = String(profile.servicesOffered ?? '').trim();
    const sinceYear = String(profile.sinceYear ?? '').trim();
    const addresses = profile.address ?? {};
    const hours = profile.workingHours ?? {};
    const numbers = Array.isArray(profile.contactNumbers) ? profile.contactNumbers : [];
    const emails = Array.isArray(profile.emails) ? profile.emails : [];
    const languages = Array.isArray(profile.languages) ? profile.languages : [];

    if (!profile.categoryId || !name || name.length < 2) return false;
    if (type === CategoryType.PROFESSIONAL_CONSULTANT && !kind) return false;
    if (independent && !String(profile.degrees ?? '').trim()) return false;
    if (!servicesOffered || servicesOffered.length < 2) return false;
    if (!/^(19|20)\d{2}$/.test(sinceYear) || Number(sinceYear) > new Date().getFullYear()) return false;

    if (!numbers.length || numbers.some((n) => !/^\+[1-9]\d{7,14}$/.test(String(n).replace(/[\s\-()]/g, '')))) {
      return false;
    }
    if (!emails.length || emails.some((m) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(m).trim()))) {
      return false;
    }

    if (!String(addresses.cityTown ?? '').trim() || !String(addresses.stateProvince ?? '').trim() || !String(addresses.country ?? '').trim()) {
      return false;
    }

    for (const key of ['weekdays', 'saturday', 'sunday'] as const) {
      const day = hours[key] as { closed?: boolean; open?: string | null; close?: string | null; breakStart?: string | null; breakEnd?: string | null } | undefined;
      if (!day || day.closed) continue;
      if (!day.open || !day.close) return false;
      if (day.open >= day.close) return false;
      if (day.breakStart || day.breakEnd) {
        if (!day.breakStart || !day.breakEnd) return false;
        if (!(day.open < day.breakStart && day.breakStart < day.breakEnd && day.breakEnd < day.close)) return false;
      }
    }

    if (!languages.length || languages.some((lang) => !String(lang).trim())) return false;
    return true;
  }

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
      gstin: dto.gstin ?? null,
      servicesOffered: dto.servicesOffered,
      servicesDetail: dto.servicesDetail ?? null,
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
