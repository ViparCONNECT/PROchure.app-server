import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';

describe('Categories & Profiles (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let categoryId: string;
  let subCategoryId: string;
  let profileId: string;
  let categoryType: string;
  const runId = Date.now().toString().slice(-8);
  const day = { closed: false, open: '09:00', close: '18:00' };
  const profileBody = (extra: Record<string, unknown> = {}) => ({
    profileType: categoryType,
    categoryId,
    consultantKind: categoryType === 'PROFESSIONAL_CONSULTANT' ? 'CONSULTANCY' : undefined,
    name: 'Test Profile',
    servicesOffered: 'Testing',
    sinceYear: '2015',
    contactNumbers: ['+919000000000'],
    emails: ['test@example.com'],
    address: { cityTown: 'Mumbai', stateProvince: 'Maharashtra', country: 'India' },
    workingHours: { weekdays: day, saturday: day, sunday: { closed: true } },
    languages: ['English'],
    ...extra,
  });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: 'URI' as any, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: process.env.SUPER_ADMIN_EMAIL ?? 'superadmin@example.com',
        password: process.env.SUPER_ADMIN_PASSWORD ?? 'ChangeMe@1234',
      });
    token = loginRes.body.data.accessToken;
  });

  afterAll(async () => await app.close());

  it('GET /api/v1/categories — lists seeded categories', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.meta.total).toBeGreaterThanOrEqual(2);
    categoryId = res.body.data.data[0].id;
    categoryType = res.body.data.data[0].type;
  });

  it('POST /categories/:id/subcategories — creates subcategory', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/categories/${categoryId}/subcategories`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test Sub' })
      .expect(201);
    subCategoryId = res.body.data.id;
  });

  it('POST /categories/:id/subcategories — rejects duplicate name', () => {
    return request(app.getHttpServer())
      .post(`/api/v1/categories/${categoryId}/subcategories`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test Sub' })
      .expect(409);
  });

  it('POST /api/v1/profiles — creates profile with valid category', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/profiles')
      .set('Authorization', `Bearer ${token}`)
      .send(profileBody({ owner: { email: `e2e-${runId}@example.com`, phone: `+9199${runId}` } }))
      .expect(201);
    profileId = res.body.data.id;
    expect(res.body.data.status).toBe('ACTIVE');
    expect(res.body.data.user.email).toBe(`e2e-${runId}@example.com`);
  });

  it('POST /api/v1/profiles — rejects subcategory from wrong category', async () => {
    // Get a different category
    const catRes = await request(app.getHttpServer())
      .get('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`);
    const otherCat = catRes.body.data.data.find(
      (c: any) => c.id !== categoryId && c.type === categoryType,
    );
    if (!otherCat) return;

    return request(app.getHttpServer())
      .post('/api/v1/profiles')
      .set('Authorization', `Bearer ${token}`)
      .send(
        profileBody({
          categoryId: otherCat.id,
          subCategoryId,
          owner: { email: `e2e-bad-${runId}@example.com`, phone: `+9198${runId}` },
        }),
      )
      .expect(422);
  });

  it('DELETE /subcategories/:id — blocked when profiles exist', () => {
    // Update the profile to use the subcategory first
    return request(app.getHttpServer())
      .put(`/api/v1/profiles/${profileId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(profileBody({ subCategoryId }))
      .then(() => {
        return request(app.getHttpServer())
          .delete(`/api/v1/subcategories/${subCategoryId}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(409);
      });
  });

  it('DELETE /api/v1/profiles/:id — deletes profile', () => {
    return request(app.getHttpServer())
      .delete(`/api/v1/profiles/${profileId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
  });

  it('DELETE /subcategories/:id — succeeds after profile removed', () => {
    return request(app.getHttpServer())
      .delete(`/api/v1/subcategories/${subCategoryId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
  });

  it('POST /api/v1/profiles — rejects unknown fields', () => {
    return request(app.getHttpServer())
      .post('/api/v1/profiles')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...profileBody(), hackerField: 'injected' })
      .expect(400);
  });
});
