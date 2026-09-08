import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
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

export class FpsEstimateDto {
  @IsOptional()
  @IsUUID()
  gameId?: string;

  @IsOptional()
  @IsString()
  gameSlug?: string;

  /** Free-text name / partial match when id/slug are absent. */
  @IsOptional()
  @IsString()
  gameQuery?: string;

  @IsOptional()
  @IsUUID()
  cpuId?: string;

  @IsOptional()
  @IsString()
  cpuSlug?: string;

  @IsOptional()
  @IsString()
  cpuQuery?: string;

  @IsOptional()
  @IsUUID()
  gpuId?: string;

  @IsOptional()
  @IsString()
  gpuSlug?: string;

  @IsOptional()
  @IsString()
  gpuQuery?: string;

  @IsInt()
  @Min(4)
  @Max(256)
  ramGb!: number;

  @IsOptional()
  @IsEnum(QualityPreset)
  preset?: QualityPreset = QualityPreset.HIGH;

  @IsOptional()
  @IsEnum(Upscaler)
  upscaler?: Upscaler = Upscaler.NONE;

  @IsOptional()
  @IsBoolean()
  rayTracing?: boolean = false;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(ScreenResolution, { each: true })
  resolutions?: ScreenResolution[];
}
