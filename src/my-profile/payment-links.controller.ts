import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { IsBoolean, IsOptional, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PaymentLinksService } from './payment-links.service';
import { VerifyPaymentDto } from './dto/verify-payment.dto';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,64}$/;

class TokenParam {
  @Matches(TOKEN_PATTERN, { message: 'Invalid payment link' })
  token!: string;
}

class PaymentLinkQuery {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  regenerate?: boolean;
}

@ApiTags('profiles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
@Controller({ path: 'profiles', version: '1' })
export class AdminPaymentLinksController {
  constructor(private readonly links: PaymentLinksService) {}

  @Post(':id/payment-link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get (or regenerate) the shareable payment link for a profile' })
  getLink(@Param('id') id: string, @Query() query: PaymentLinkQuery) {
    return this.links.getOrCreateLink(id, query.regenerate ?? false);
  }
}

@ApiTags('public')
@Controller({ path: 'public/payment-links', version: '1' })
export class PublicPaymentLinksController {
  constructor(private readonly links: PaymentLinksService) {}

  @Get(':token')
  @ApiOperation({ summary: 'Profile card + fee for a payment link (no login)' })
  get(@Param() { token }: TokenParam) {
    return this.links.getByToken(token);
  }

  @Post(':token/order')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a Razorpay order via a payment link (no login)' })
  order(@Param() { token }: TokenParam) {
    return this.links.createOrder(token);
  }

  @Post(':token/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify a payment made via a payment link (no login)' })
  verify(@Param() { token }: TokenParam, @Body() dto: VerifyPaymentDto) {
    return this.links.verify(token, dto);
  }
}
