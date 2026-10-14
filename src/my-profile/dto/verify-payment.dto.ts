import { IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyPaymentDto {
  @ApiProperty({ example: 'order_Nxxxxxxxxxxxxx' })
  @Matches(/^order_[A-Za-z0-9]+$/)
  razorpayOrderId!: string;

  @ApiProperty({ example: 'pay_Nxxxxxxxxxxxxx' })
  @Matches(/^pay_[A-Za-z0-9]+$/)
  razorpayPaymentId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(128)
  razorpaySignature!: string;
}
