import { Test } from '@nestjs/testing';
import { NotFoundException, UnprocessableEntityException, ValidationPipe } from '@nestjs/common';
import { CategoryType, ConsultantKind } from '@prisma/client';
import { ProfileDataService } from './profile-data.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileContentDto } from './dto/profile-content.dto';

const CAT_ID = '64b7f0000000000000000001';
const SUB_ID = '64b7f0000000000000000002';
const open = (o = '09:00', c = '18:00') => ({ closed: false, open: o, close: c });
const closed = { closed: true };

const validConsultant = (): any => ({
  profileType: CategoryType.PROFESSIONAL_CONSULTANT,
  categoryId: CAT_ID,
  consultantKind: ConsultantKind.INDEPENDENT,
  name: 'Dr. Asha Rao',
  degrees: 'MBBS, MD',
  registrationNumber: 'KMC 12345',
  consultantName: 'should be dropped',
  servicesOffered: 'Cardiology',
  sinceYear: '2012',
  isWomenEntrepreneur: true,
  contactNumbers: ['+91 98765 43210'],
  emails: ['Asha@Example.com'],
  address: { cityTown: 'Kochi', stateProvince: 'Kerala', country: 'India' },
  workingHours: {
    weekdays: { ...open(), breakStart: '13:00', breakEnd: '14:00' },
    saturday: open('10:00', '14:00'),
    sunday: closed,
  },
  languages: ['English', 'Malayalam'],
});

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const validate = (body: unknown) =>
  pipe.transform(body, { type: 'body', metatype: ProfileContentDto }) as Promise<ProfileContentDto>;
const messagesOf = async (body: unknown): Promise<string[]> => {
  try {
    await validate(body);
    return [];
  } catch (e: any) {
    return e.getResponse().message;
  }
};

describe('ProfileContentDto validation', () => {
  it('accepts a valid independent consultant and normalises phones/emails', async () => {
    const dto = await validate(validConsultant());
    expect(dto.contactNumbers).toEqual(['+919876543210']);
    expect(dto.emails).toEqual(['asha@example.com']);
  });

  it('requires consultantKind and degrees for an independent consultant', async () => {
    expect((await messagesOf({ ...validConsultant(), consultantKind: undefined })).join()).toMatch(
      /Independent Professional or Professional Consultancy/,
    );
    expect((await messagesOf({ ...validConsultant(), degrees: '' })).join()).toMatch(
      /Degrees are required/,
    );
  });

  it('does not require degrees for consultancy or brands', async () => {
    expect(
      await messagesOf({ ...validConsultant(), consultantKind: 'CONSULTANCY', degrees: undefined }),
    ).toEqual([]);
    expect(
      await messagesOf({
        ...validConsultant(),
        profileType: CategoryType.SERVICE_AND_RETAIL_BRANDS,
        consultantKind: undefined,
        degrees: undefined,
      }),
    ).toEqual([]);
  });

  it('enforces 1–3 contact numbers / emails, languages, year and address', async () => {
    const msgs = (
      await messagesOf({
        ...validConsultant(),
        contactNumbers: [],
        emails: ['a@b.com', 'c@d.com', 'e@f.com', 'g@h.com'],
        languages: [],
        sinceYear: '12',
        address: { cityTown: 'Kochi' },
      })
    ).join(' | ');
    expect(msgs).toMatch(/At least one contact number/);
    expect(msgs).toMatch(/emails must contain no more than 3/);
    expect(msgs).toMatch(/at least one preferred language/);
    expect(msgs).toMatch(/4-digit year/);
    expect(msgs).toMatch(/stateProvince/);
  });

  it('requires open/close times unless the day is a holiday', async () => {
    const msgs = await messagesOf({
      ...validConsultant(),
      workingHours: { ...validConsultant().workingHours, saturday: { closed: false } },
    });
    expect(msgs.join()).toMatch(/open time must be in HH:mm/);
    expect(
      await messagesOf({
        ...validConsultant(),
        workingHours: { weekdays: closed, saturday: closed, sunday: closed },
      }),
    ).toEqual([]);
  });
});

describe('ProfileDataService.toData', () => {
  const prisma = { category: { findUnique: jest.fn() }, subCategory: { findUnique: jest.fn() } };
  let service: ProfileDataService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const mod = await Test.createTestingModule({
      providers: [ProfileDataService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(ProfileDataService);
    prisma.category.findUnique.mockResolvedValue({
      id: CAT_ID,
      name: 'Doctors',
      type: CategoryType.PROFESSIONAL_CONSULTANT,
      isSubCategoryNeeded: false,
    });
  });

  it('drops fields that do not apply to the chosen kind', async () => {
    const data = await service.toData(await validate(validConsultant()));
    expect(data).toMatchObject({
      consultantKind: 'INDEPENDENT',
      degrees: 'MBBS, MD',
      consultantName: null,
    });

    const consultancy = await service.toData(
      await validate({ ...validConsultant(), consultantKind: 'CONSULTANCY' }),
    );
    expect(consultancy).toMatchObject({
      consultantName: 'should be dropped',
      degrees: null,
      registrationNumber: null,
    });
  });

  it('rejects a category of the other type', async () => {
    prisma.category.findUnique.mockResolvedValue({
      id: CAT_ID,
      type: CategoryType.SERVICE_AND_RETAIL_BRANDS,
    });
    await expect(service.toData(await validate(validConsultant()))).rejects.toThrow(
      /does not belong to this profile type/,
    );
  });

  it('requires a subcategory when the category needs one, and checks it belongs', async () => {
    prisma.category.findUnique.mockResolvedValue({
      id: CAT_ID,
      name: 'Doctors',
      type: 'PROFESSIONAL_CONSULTANT',
      isSubCategoryNeeded: true,
    });
    await expect(service.toData(await validate(validConsultant()))).rejects.toThrow(
      /select a subcategory/,
    );

    prisma.subCategory.findUnique.mockResolvedValue({ id: SUB_ID, categoryId: 'other' });
    await expect(
      service.toData(await validate({ ...validConsultant(), subCategoryId: SUB_ID })),
    ).rejects.toThrow(UnprocessableEntityException);
    prisma.subCategory.findUnique.mockResolvedValue(null);
    await expect(
      service.toData(await validate({ ...validConsultant(), subCategoryId: SUB_ID })),
    ).rejects.toThrow(NotFoundException);
  });

  it('validates time ordering and lunch break placement', async () => {
    const wh = (weekdays: object) => ({
      ...validConsultant(),
      workingHours: { ...validConsultant().workingHours, weekdays },
    });
    await expect(service.toData(await validate(wh(open('18:00', '09:00'))))).rejects.toThrow(
      /closing time must be after/,
    );
    await expect(
      service.toData(await validate(wh({ ...open(), breakStart: '19:00', breakEnd: '20:00' }))),
    ).rejects.toThrow(/lunch break must be within/);
  });

  it('rejects a future year', async () => {
    await expect(
      service.toData(await validate({ ...validConsultant(), sinceYear: '2099' })),
    ).rejects.toThrow(/future/);
  });
});
