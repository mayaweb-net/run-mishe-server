import { BadRequestException, Controller, Post } from '@nestjs/common';
import {
  Multipart,
  type MultipartResult,
} from '@/app/decorators/multipart.decorator';
import { UploadService } from '@/app/modules/upload/upload.service';
import { resolveUploadRelativePath } from '@/app/modules/upload/upload-path';

function sanitizeFilename(filename: string): string {
  const base = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  return base || 'file';
}

@Controller('admin/uploads')
export class AdminUploadsController {
  constructor(private readonly uploadService: UploadService) {}

  @Post()
  async upload(
    @Multipart({ required: true, fileRequiredMessage: 'فایل الزامی است.' })
    multipart: MultipartResult,
  ) {
    const file = multipart.file!;
    const mimetype = file.mimetype ?? '';

    if (!mimetype.startsWith('image/')) {
      throw new BadRequestException('فقط فایل تصویر مجاز است');
    }

    const originalName = sanitizeFilename(file.filename ?? 'file');
    const path = resolveUploadRelativePath({
      folder: multipart.fields.folder,
      ownerId: multipart.fields.ownerId,
      scope: multipart.fields.scope,
      originalName,
    });

    await this.uploadService.upload(file.buffer, path, mimetype);

    return {
      path,
      url: this.uploadService.url(path),
    };
  }
}
