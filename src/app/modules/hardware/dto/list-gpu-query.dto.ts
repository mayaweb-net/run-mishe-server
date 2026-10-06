import {
  DataQuality,
  FormFactor,
  Vendor,
} from '@/app/db/generated/prisma/client';
import { PaginationQueryDto } from '@/app/common/dto/pagination-query.dto';
import { Type, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return value as boolean;
}

export class ListGpuQueryDto extends PaginationQueryDto {
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
  @Type(() => Number)
  @IsInt()
  @Min(0)
  vramMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  vramMax?: number;

  @IsOptional()
  @IsString()
  family?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  generation?: number;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  supportsRayTracing?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dlssMin?: number;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  supportsFrameGen?: boolean;

  @IsOptional()
  @IsString()
  memoryType?: string;

  @IsOptional()
  @IsIn(['name', 'gamingIndex', 'createdAt', 'releaseDate', 'vramGb'])
  sortBy: 'name' | 'gamingIndex' | 'createdAt' | 'releaseDate' | 'vramGb' =
    'name';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';
}
