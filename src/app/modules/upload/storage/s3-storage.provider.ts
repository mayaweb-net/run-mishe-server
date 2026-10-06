import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { StorageProvider } from './storage.provider';

@Injectable()
export class S3StorageProvider implements StorageProvider, OnModuleInit {
  private readonly logger = new Logger(S3StorageProvider.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBasePath: string;

  constructor(private readonly configService: ConfigService) {
    const endpoint = this.configService.getOrThrow<string>('storage.endpoint');
    const region = this.configService.getOrThrow<string>('storage.region');
    const accessKey = this.configService.getOrThrow<string>('storage.accessKey');
    const secretKey = this.configService.getOrThrow<string>('storage.secretKey');
    const forcePathStyle =
      this.configService.get<boolean>('storage.forcePathStyle') ?? true;

    this.bucket = this.configService.getOrThrow<string>('storage.bucket');
    this.publicBasePath = this.configService.getOrThrow<string>(
      'storage.publicBasePath',
    );

    this.client = new S3Client({
      endpoint,
      region,
      forcePathStyle,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
    });
  }

  async onModuleInit() {
    await this.ensureReady();
  }

  async ensureReady(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      this.logger.log(`Creating S3 bucket "${this.bucket}"…`);
      try {
        await this.client.send(
          new CreateBucketCommand({ Bucket: this.bucket }),
        );
        this.logger.log(`S3 bucket "${this.bucket}" created`);
      } catch (error) {
        this.logger.warn(
          `Could not ensure S3 bucket "${this.bucket}": ${String(error)}`,
        );
      }
    }
  }

  async upload(
    buffer: Buffer,
    filePath: string,
    contentType?: string,
  ): Promise<string> {
    const relativePath = this.normalizeRelativePath(filePath);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: relativePath,
        Body: buffer,
        ContentType: contentType || this.contentTypeFor(relativePath),
      }),
    );

    return relativePath;
  }

  async delete(filePath: string): Promise<void> {
    const relativePath = this.normalizeRelativePath(filePath);
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: relativePath,
      }),
    );
  }

  async exists(filePath: string): Promise<boolean> {
    const relativePath = this.normalizeRelativePath(filePath);
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: relativePath,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async read(filePath: string): Promise<Buffer> {
    const relativePath = this.normalizeRelativePath(filePath);
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: relativePath,
        }),
      );
      const bytes = await result.Body?.transformToByteArray();
      if (!bytes) {
        throw new NotFoundException('فایل یافت نشد');
      }
      return Buffer.from(bytes);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new NotFoundException('فایل یافت نشد');
    }
  }

  url(filePath: string): string {
    const relativePath = this.normalizeRelativePath(filePath);
    const encoded = relativePath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    return `${this.publicBasePath.replace(/\/$/, '')}/${encoded}`;
  }

  private normalizeRelativePath(filePath: string): string {
    return filePath.replace(/\\/g, '/').replace(/^\/+/, '').trim();
  }

  private contentTypeFor(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'png':
        return 'image/png';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'webp':
        return 'image/webp';
      case 'gif':
        return 'image/gif';
      case 'svg':
        return 'image/svg+xml';
      case 'pdf':
        return 'application/pdf';
      default:
        return 'application/octet-stream';
    }
  }
}
