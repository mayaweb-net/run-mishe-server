import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  QualityPreset,
  ScreenResolution,
  Upscaler,
} from '@/app/db/generated/prisma/client';

export class CreateFpsSampleEntryDto {
  @IsEnum(ScreenResolution)
  resolution!: ScreenResolution;

  @IsEnum(QualityPreset)
  preset!: QualityPreset;

  @IsNumber()
  @Min(1)
  @Max(1000)
  avgFps!: number;

  @IsOptional()
  @IsEnum(Upscaler)
  upscaler?: Upscaler = Upscaler.NONE;

  @IsOptional()
  @IsBoolean()
  rayTracing?: boolean = false;

  @IsOptional()
  @IsBoolean()
  frameGen?: boolean = false;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000)
  onePercentLow?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(4)
  @Max(256)
  ramGb?: number;
}

/**
 * Batch create: fixed game/CPU/GPU + array of resolution/preset/FPS rows.
 * Source defaults to `manual`.
 */
export class CreateFpsSamplesDto {
  @IsUUID()
  gameId!: string;

  @IsUUID()
  cpuId!: string;

  @IsUUID()
  gpuId!: string;

  @IsOptional()
  @IsString()
  source?: string = 'manual';

  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number = 0.9;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateFpsSampleEntryDto)
  entries!: CreateFpsSampleEntryDto[];
}
