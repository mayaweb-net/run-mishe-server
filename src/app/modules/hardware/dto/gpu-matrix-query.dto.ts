import {
  QualityPreset,
  ScreenResolution,
} from '@/app/db/generated/prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ListGpuQueryDto } from './list-gpu-query.dto';

export class GpuMatrixQueryDto extends ListGpuQueryDto {
  @IsOptional()
  @IsIn(['fps', 'benchmark'])
  mode: 'fps' | 'benchmark' = 'fps';

  @IsOptional()
  @IsUUID()
  cpuId?: string;

  @IsOptional()
  @IsEnum(ScreenResolution)
  resolution: ScreenResolution = ScreenResolution.R1080P;

  @IsOptional()
  @IsEnum(QualityPreset)
  preset: QualityPreset = QualityPreset.HIGH;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(4)
  @Max(256)
  ramGb = 16;
}
