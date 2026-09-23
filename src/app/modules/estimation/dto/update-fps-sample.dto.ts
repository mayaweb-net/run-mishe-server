import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import {
  QualityPreset,
  ScreenResolution,
  Upscaler,
} from '@/app/db/generated/prisma/client';

export class UpdateFpsSampleDto {
  @IsOptional()
  @IsUUID()
  gameId?: string;

  @IsOptional()
  @IsUUID()
  cpuId?: string;

  @IsOptional()
  @IsUUID()
  gpuId?: string;

  @IsOptional()
  @IsEnum(ScreenResolution)
  resolution?: ScreenResolution;

  @IsOptional()
  @IsEnum(QualityPreset)
  preset?: QualityPreset;

  @IsOptional()
  @IsEnum(Upscaler)
  upscaler?: Upscaler;

  @IsOptional()
  @IsBoolean()
  rayTracing?: boolean;

  @IsOptional()
  @IsBoolean()
  frameGen?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(4)
  @Max(256)
  ramGb?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  avgFps?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000)
  onePercentLow?: number | null;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  sourceUrl?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;
}
