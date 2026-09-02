import { DataQuality, FormFactor, Vendor } from '@/app/db/generated/prisma/client';
import { PaginationQueryDto } from '@/app/common/dto/pagination-query.dto';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';

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
  @IsIn(['name', 'gamingIndex', 'createdAt', 'releaseDate', 'vramGb'])
  sortBy: 'name' | 'gamingIndex' | 'createdAt' | 'releaseDate' | 'vramGb' =
    'name';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';
}
