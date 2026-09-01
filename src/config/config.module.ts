import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        PORT: Joi.number().default(3000),
        DATABASE_URL: Joi.string().required(),
        JWT_ACCESS_SECRET: Joi.string().min(32).required(),
        JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
        JWT_REFRESH_SECRET: Joi.string().min(32).required(),
        JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
        COOKIE_SECURE: Joi.boolean().default(false),
        COOKIE_SAME_SITE: Joi.string().valid('strict', 'lax', 'none').default('lax'),
        CORS_ORIGINS: Joi.string().required(),
        THROTTLE_TTL: Joi.number().default(60000),
        THROTTLE_LIMIT: Joi.number().default(100),
        SUPER_ADMIN_EMAIL: Joi.string().email().required(),
        SUPER_ADMIN_PASSWORD: Joi.string().min(8).required(),
        SUPER_ADMIN_FIRST_NAME: Joi.string().default('Super'),
        SUPER_ADMIN_LAST_NAME: Joi.string().default('Admin'),
        PASSWORD_MIN_LENGTH: Joi.number().default(8),
        MAIL_HOST: Joi.string().required(),
        MAIL_PORT: Joi.number().default(587),
        MAIL_SECURE: Joi.boolean().default(false),
        MAIL_USER: Joi.string().required(),
        MAIL_PASS: Joi.string().required(),
        MAIL_FROM: Joi.string().required(),
        PASSWORD_RESET_TTL_MINUTES: Joi.number().default(30),
        FRONTEND_URL: Joi.string().uri().required(),
        AWS_REGION: Joi.string().default('ap-south-1'),
        AWS_S3_BUCKET: Joi.string().required(),
        AWS_S3_ACCESS_KEY_ID: Joi.string().optional(),
        AWS_S3_SECRET_ACCESS_KEY: Joi.string().optional(),
      }),
    }),
  ],
})
export class AppConfigModule {}
