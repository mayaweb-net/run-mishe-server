import {
  DataQuality,
  FormFactor,
  Vendor,
} from '@/app/db/generated/prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateCpuDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsEnum(Vendor)
  vendor!: Vendor;

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
  codename?: string;

  @IsOptional()
  @IsString()
  architecture?: string;

  @IsOptional()
  @IsString()
  socket?: string;

  @IsOptional()
  @IsDateString()
  releaseDate?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  performanceCores!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  efficiencyCores?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  threads!: number;

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
  @IsNumber()
  l2CacheMb?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  l3CacheMb?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  tdpWatt?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxTempC?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  processNodeNm?: number;

  @IsOptional()
  @IsEnum(FormFactor)
  formFactor?: FormFactor;

  @IsOptional()
  @IsBoolean()
  isUnlocked?: boolean;

  @IsOptional()
  @IsBoolean()
  isX3d?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  memoryTypes?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  memoryChannels?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxMemoryGb?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pcieVersion?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pcieLanes?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  instructionSets?: string[];

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
