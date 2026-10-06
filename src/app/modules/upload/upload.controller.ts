import {
  Controller,
  Get,
  NotFoundException,
  Req,
  Res,
} from '@nestjs/common';
import { UploadService } from './upload.service';

function contentTypeFor(filePath: string): string {
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
    case 'json':
      return 'application/json';
    case 'txt':
      return 'text/plain; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

type FastifyLikeReply = {
  header: (key: string, value: string) => FastifyLikeReply;
  send: (payload: Buffer) => unknown;
};

type FastifyLikeRequest = {
  url: string;
};

@Controller('files')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Get('*')
  async serve(
    @Req() request: FastifyLikeRequest,
    @Res({ passthrough: false }) reply: FastifyLikeReply,
  ) {
    const prefix = '/api/files/';
    const pathname = request.url.split('?')[0] ?? '';
    const encodedPath = pathname.startsWith(prefix)
      ? pathname.slice(prefix.length)
      : pathname.replace(/^\/+/, '');

    if (!encodedPath) {
      throw new NotFoundException('فایل یافت نشد');
    }

    const filePath = decodeURIComponent(encodedPath);
    const buffer = await this.uploadService.read(filePath);

    return reply
      .header('Content-Type', contentTypeFor(filePath))
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .header('Cross-Origin-Resource-Policy', 'cross-origin')
      .send(buffer);
  }
}
