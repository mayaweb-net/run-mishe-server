import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ArticleStatus } from '@/app/db/generated/prisma/client';

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

export class CreateArticleDto {
  @IsOptional()
  @IsUUID('4', { message: 'شناسه مقاله نامعتبر است' })
  id?: string;

  @IsString()
  @MinLength(1, { message: 'عنوان الزامی است' })
  title!: string;

  @IsOptional()
  @IsString()
  @ValidateIf((_, v) => v != null && v !== '')
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'اسلاگ فقط می‌تواند شامل حروف کوچک انگلیسی، عدد و خط تیره باشد',
  })
  slug?: string;

  @IsString()
  content!: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(500, { message: 'خلاصه حداکثر ۵۰۰ کاراکتر است' })
  excerpt?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  coverPath?: string | null;

  @IsOptional()
  @IsEnum(ArticleStatus, { message: 'وضعیت معتبر نیست' })
  status?: ArticleStatus;

  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v != null && v !== '')
  @IsUUID('4', { message: 'دسته‌بندی معتبر نیست' })
  categoryId?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(120)
  authorName?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(120, { message: 'عنوان متا حداکثر ۱۲۰ کاراکتر است' })
  metaTitle?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(320, { message: 'توضیح متا حداکثر ۳۲۰ کاراکتر است' })
  metaDescription?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v != null && v !== '')
  @IsUrl({ require_protocol: true }, { message: 'آدرس canonical معتبر نیست' })
  canonicalUrl?: string | null;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  noIndex?: boolean;
}

export class UpdateArticleDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'عنوان نمی‌تواند خالی باشد' })
  title?: string;

  @IsOptional()
  @IsString()
  @ValidateIf((_, v) => v != null && v !== '')
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'اسلاگ فقط می‌تواند شامل حروف کوچک انگلیسی، عدد و خط تیره باشد',
  })
  slug?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(500, { message: 'خلاصه حداکثر ۵۰۰ کاراکتر است' })
  excerpt?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  coverPath?: string | null;

  @IsOptional()
  @IsEnum(ArticleStatus, { message: 'وضعیت معتبر نیست' })
  status?: ArticleStatus;

  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v != null && v !== '')
  @IsUUID('4', { message: 'دسته‌بندی معتبر نیست' })
  categoryId?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(120)
  authorName?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(120, { message: 'عنوان متا حداکثر ۱۲۰ کاراکتر است' })
  metaTitle?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(320, { message: 'توضیح متا حداکثر ۳۲۰ کاراکتر است' })
  metaDescription?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v != null && v !== '')
  @IsUrl({ require_protocol: true }, { message: 'آدرس canonical معتبر نیست' })
  canonicalUrl?: string | null;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  noIndex?: boolean;
}
