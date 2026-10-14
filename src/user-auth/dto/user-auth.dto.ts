import { IsEmail, IsString, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export const E164_REGEX = /^\+[1-9]\d{7,14}$/;
// OTP length is configured in the MSG91 widget (4–8 digits)
const OTP_REGEX = /^\d{4,8}$/;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const normalizePhone = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/[\s\-()]/g, '') : value;

export class RegisterSendOtpDto {
  @ApiProperty({ example: 'Asha Rao' })
  @Transform(trim)
  @IsString()
  @Length(2, 100)
  name!: string;

  @ApiProperty({ example: 'asha@example.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: '+919876543210',
    description: 'Mobile number in E.164 format (WhatsApp)',
  })
  @Transform(normalizePhone)
  @Matches(E164_REGEX, { message: 'phone must be a valid mobile number with country code' })
  phone!: string;
}

export class RegisterVerifyDto {
  @ApiProperty({ example: '+919876543210' })
  @Transform(normalizePhone)
  @Matches(E164_REGEX, { message: 'phone must be a valid mobile number with country code' })
  phone!: string;

  @ApiProperty({ example: '123456' })
  @Matches(OTP_REGEX, { message: 'Enter the OTP you received' })
  otp!: string;
}

export class LoginSendOtpDto {
  @ApiProperty({
    example: 'asha@example.com',
    description: 'Registered email or E.164 mobile number',
  })
  @Transform(normalizePhone)
  @IsString()
  @Length(3, 254)
  identifier!: string;
}

export class LoginVerifyDto extends LoginSendOtpDto {
  @ApiProperty({ example: '123456' })
  @Matches(OTP_REGEX, { message: 'Enter the OTP you received' })
  otp!: string;
}
