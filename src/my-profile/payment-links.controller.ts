import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PaymentLinksService } from './payment-links.service';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { Matches } from 'class-validator';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{5,128}$/;

class TokenParam {
  @Matches(TOKEN_PATTERN, { message: 'Invalid payment link' })
  token!: string;
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
  @ApiOperation({ summary: 'Get the shareable payment link for a profile' })
  getLink(@Param('id') id: string) {
    return this.links.getOrCreateLink(id, false);
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
