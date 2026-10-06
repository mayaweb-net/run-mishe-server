import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import {
  toUploadedFile,
  getMultipartFields,
  type MultipartPart,
  type IMultipartResult,
} from '../utils/file-transformer';

export type MultipartResult = IMultipartResult;

export interface MultipartDecoratorOptions {
  required?: boolean;
  fileRequiredMessage?: string;
}

export const Multipart = createParamDecorator(
  async (
    options: MultipartDecoratorOptions | undefined,
    ctx: ExecutionContext,
  ): Promise<IMultipartResult> => {
    const req = ctx.switchToHttp().getRequest();
    const part: MultipartPart | undefined = await req.file?.();

    if (!part) {
      if (options?.required) {
        throw new BadRequestException(
          options?.fileRequiredMessage ?? 'فایل الزامی است.',
        );
      }
      return { file: null, fields: {} };
    }
    const file = await toUploadedFile(part);
    const fields = getMultipartFields(part);
    return { file, fields };
  },
);
