import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';

describe('Admins (e2e)', () => {
  let app: INestApplication;
  let superAdminToken: string;
  let createdAdminId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: 'URI' as any, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: process.env.SUPER_ADMIN_EMAIL ?? 'superadmin@example.com',
        password: process.env.SUPER_ADMIN_PASSWORD ?? 'ChangeMe@1234',
      });
    superAdminToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/admins — requires SUPER_ADMIN', () => {
    return request(app.getHttpServer()).get('/api/v1/admins').expect(401);
  });

  it('POST /api/v1/admins — creates a new admin', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admins')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        email: 'newadmin@test.com',
        password: 'TestPass@123',
        role: 'ADMIN',
        firstName: 'Test',
        lastName: 'Admin',
      })
      .expect(201);

    createdAdminId = res.body.data.id;
    expect(res.body.data.passwordHash).toBeUndefined();
  });

  it('POST /api/v1/admins — rejects duplicate email', () => {
    return request(app.getHttpServer())
      .post('/api/v1/admins')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ email: 'newadmin@test.com', password: 'TestPass@123', role: 'ADMIN', firstName: 'Dup', lastName: 'Admin' })
      .expect(409);
  });

  it('GET /api/v1/admins/:id — returns admin', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/admins/${createdAdminId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(200);
    expect(res.body.data.id).toBe(createdAdminId);
  });

  it('DELETE /api/v1/admins/:id — soft-deletes admin', () => {
    return request(app.getHttpServer())
      .delete(`/api/v1/admins/${createdAdminId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(204);
  });

  it('GET /api/v1/admins/:id — 404 after soft delete', () => {
    return request(app.getHttpServer())
      .get(`/api/v1/admins/${createdAdminId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(404);
  });
});
