import { Type } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { PaginationQueryDto } from '@/app/common/dto/pagination-query.dto';

const RESOLUTIONS = [
  'R720P',
  'R1080P',
  'R1440P',
  'R2160P',
  'UW1440P',
  'UW2160P',
] as const;

const PRESETS = ['LOW', 'MEDIUM', 'HIGH', 'ULTRA'] as const;

export class ListFpsSampleQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsUUID()
  gameId?: string;

  @IsOptional()
  @IsUUID()
  gpuId?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsIn([...RESOLUTIONS])
  resolution?: (typeof RESOLUTIONS)[number];

  @IsOptional()
  @IsIn([...PRESETS])
  preset?: (typeof PRESETS)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1)
  hasOnePercentLow?: 0 | 1;

  @IsOptional()
  @IsIn([
    'avgFps',
    'capturedAt',
    'confidence',
    'gameName',
    'gpuName',
    'source',
  ])
  sortBy:
    | 'avgFps'
    | 'capturedAt'
    | 'confidence'
    | 'gameName'
    | 'gpuName'
    | 'source' = 'capturedAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
