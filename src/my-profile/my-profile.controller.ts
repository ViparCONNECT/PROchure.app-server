import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MyProfileService } from './my-profile.service';
import { ProfileContentDto } from '../profiles/dto/profile-content.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { UserJwtAuthGuard } from '../user-auth/guards/user-auth.guards';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserJwtPayload } from '../common/interfaces/user-jwt-payload.interface';

@ApiTags('my-profile')
@ApiBearerAuth()
@UseGuards(UserJwtAuthGuard)
@Controller({ path: 'me/profile', version: '1' })
export class MyProfileController {
  constructor(private readonly myProfile: MyProfileService) {}

  @Get()
  @ApiOperation({ summary: "Logged-in user's profile (null if none) and the listing fee" })
  get(@CurrentUser() user: UserJwtPayload) {
    return this.myProfile.get(user.sub);
  }

  @Post()
  @ApiOperation({ summary: 'Create own profile (pending payment)' })
  create(@CurrentUser() user: UserJwtPayload, @Body() dto: ProfileContentDto) {
    return this.myProfile.create(user.sub, dto);
  }

  @Put()
  @ApiOperation({ summary: 'Update own profile' })
  update(@CurrentUser() user: UserJwtPayload, @Body() dto: ProfileContentDto) {
    return this.myProfile.update(user.sub, dto);
  }

  @Post('payment/order')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a Razorpay order for the listing fee' })
  createOrder(@CurrentUser() user: UserJwtPayload) {
    return this.myProfile.createPaymentOrder(user.sub);
  }

  @Post('payment/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify Razorpay checkout signature and publish the profile' })
  verify(@CurrentUser() user: UserJwtPayload, @Body() dto: VerifyPaymentDto) {
    return this.myProfile.verifyPayment(user.sub, dto);
  }
}
