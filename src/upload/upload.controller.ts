import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UploadService } from './upload.service';
import { GetSignedUrlDto } from './dto/get-signed-url.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('upload')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'upload', version: '1' })
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('signed-url')
  @ApiOperation({ summary: 'Get a pre-signed S3 URL to upload an image directly from the browser' })
  getSignedUrl(@Body() dto: GetSignedUrlDto) {
    return this.uploadService.getSignedUploadUrl(dto);
  }
}
