import { QualityPreset, ScreenResolution } from '@/app/db/generated/prisma/client';
import { PaginationQueryDto } from '@/app/common/dto/pagination-query.dto';
import { IsEnum, IsIn, IsOptional } from 'class-validator';

export class ListDefaultScalingQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ScreenResolution)
  resolution?: ScreenResolution;

  @IsOptional()
  @IsEnum(QualityPreset)
  preset?: QualityPreset;

  @IsOptional()
  @IsIn(['resolution', 'preset', 'multiplier'])
  sortBy: 'resolution' | 'preset' | 'multiplier' = 'resolution';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';
}
