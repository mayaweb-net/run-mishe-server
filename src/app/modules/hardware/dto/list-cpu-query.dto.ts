import {
  DataQuality,
  FormFactor,
  Vendor,
} from '@/app/db/generated/prisma/client';
import { PaginationQueryDto } from '@/app/common/dto/pagination-query.dto';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return value as boolean;
}

export class ListCpuQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsEnum(Vendor)
  vendor?: Vendor;

  @IsOptional()
  @IsEnum(FormFactor)
  formFactor?: FormFactor;

  @IsOptional()
  @IsEnum(DataQuality)
  quality?: DataQuality;

  @IsOptional()
  @IsString()
  socket?: string;

  @IsOptional()
  @IsString()
  family?: string;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  isX3d?: boolean;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  isUnlocked?: boolean;

  @IsOptional()
  @IsIn(['name', 'gamingIndex', 'createdAt', 'releaseDate'])
  sortBy: 'name' | 'gamingIndex' | 'createdAt' | 'releaseDate' = 'name';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';
}
