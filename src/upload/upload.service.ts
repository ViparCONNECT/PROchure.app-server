import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { GetSignedUrlDto } from './dto/get-signed-url.dto';

@Injectable()
export class UploadService {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly region: string;

  constructor(private readonly config: ConfigService) {
    this.region = config.getOrThrow<string>('AWS_REGION');
    this.bucket = config.getOrThrow<string>('AWS_S3_BUCKET');

    // On ECS the task role provides credentials automatically; explicit keys are optional (for local dev)
    const accessKeyId = config.get<string>('AWS_S3_ACCESS_KEY_ID');
    const secretAccessKey = config.get<string>('AWS_S3_SECRET_ACCESS_KEY');

    this.s3 = new S3Client({
      region: this.region,
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });
  }

  async getSignedUploadUrl(dto: GetSignedUrlDto) {
    const ext = dto.fileName.split('.').pop()?.toLowerCase() ?? 'jpg';
    const folder = dto.folder ?? 'uploads';
    const key = `${folder}/${uuidv4()}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: dto.fileType,
    });

    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 300 }); // 5 min
    const fileUrl = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;

    return { uploadUrl, fileUrl, key };
  }
}
