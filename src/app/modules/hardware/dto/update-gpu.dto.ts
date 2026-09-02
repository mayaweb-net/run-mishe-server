import {
  DataQuality,
  FormFactor,
  Vendor,
} from '@/app/db/generated/prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateGpuDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsEnum(Vendor)
  vendor?: Vendor;

  @IsOptional()
  @IsString()
  family?: string;

  @IsOptional()
  @IsString()
  series?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  generation?: number;

  @IsOptional()
  @IsString()
  architecture?: string;

  @IsOptional()
  @IsString()
  codename?: string;

  @IsOptional()
  @IsString()
  chip?: string;

  @IsOptional()
  @IsDateString()
  releaseDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  shadingUnits?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  baseClockMhz?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  boostClockMhz?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  vramGb?: number;

  @IsOptional()
  @IsString()
  memoryType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  memoryBusBits?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  bandwidthGbps?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  tdpWatt?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  recommendedPsuW?: number;

  @IsOptional()
  @IsEnum(FormFactor)
  formFactor?: FormFactor;

  @IsOptional()
  @IsBoolean()
  isWorkstation?: boolean;

  @IsOptional()
  @IsBoolean()
  supportsRayTracing?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  msrpUsd?: number;

  @IsOptional()
  @IsEnum(DataQuality)
  quality?: DataQuality;

  @IsOptional()
  @IsString()
  sourceName?: string;

  @IsOptional()
  @IsString()
  sourceUrl?: string;
}
