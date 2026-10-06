import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

function emptyToNull({ value }: { value: unknown }) {
  if (value === '' || value === undefined) return null;
  return value;
}

function toBoolean({ value }: { value: unknown }) {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return value;
}

function toInt({ value }: { value: unknown }) {
  if (value === '' || value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : value;
}

export class CreateArticleCategoryDto {
  @IsString()
  @MinLength(1, { message: 'نام دسته‌بندی الزامی است' })
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @ValidateIf((_, v) => v != null && v !== '')
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'اسلاگ فقط می‌تواند شامل حروف کوچک انگلیسی، عدد و خط تیره باشد',
  })
  slug?: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString({ message: 'توضیحات نامعتبر است' })
  @MaxLength(500, { message: 'توضیحات حداکثر ۵۰۰ کاراکتر است' })
  description?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(120)
  metaTitle?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(320)
  metaDescription?: string | null;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  noIndex?: boolean;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  sortOrder?: number;
}

export class UpdateArticleCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'نام دسته‌بندی نمی‌تواند خالی باشد' })
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @ValidateIf((_, v) => v != null && v !== '')
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'اسلاگ فقط می‌تواند شامل حروف کوچک انگلیسی، عدد و خط تیره باشد',
  })
  slug?: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString({ message: 'توضیحات نامعتبر است' })
  @MaxLength(500, { message: 'توضیحات حداکثر ۵۰۰ کاراکتر است' })
  description?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(120)
  metaTitle?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(320)
  metaDescription?: string | null;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  noIndex?: boolean;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  sortOrder?: number;
}
