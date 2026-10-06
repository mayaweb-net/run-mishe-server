import { Global, Module } from '@nestjs/common';
import { AdminUploadsController } from './admin-uploads.controller';
import { S3StorageProvider } from './storage/s3-storage.provider';
import { STORAGE_PROVIDER } from './storage/storage.provider';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

@Global()
@Module({
  controllers: [UploadController, AdminUploadsController],
  providers: [
    UploadService,
    S3StorageProvider,
    {
      provide: STORAGE_PROVIDER,
      useExisting: S3StorageProvider,
    },
  ],
  exports: [UploadService, STORAGE_PROVIDER],
})
export class UploadModule {}
