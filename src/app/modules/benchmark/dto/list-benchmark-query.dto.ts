import { HardwareKind } from '@/app/db/generated/prisma/client';
import { PaginationQueryDto } from '@/app/common/dto/pagination-query.dto';
import { IsBooleanString, IsEnum, IsIn, IsOptional, IsString } from 'class-validator';

export class ListBenchmarkQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsEnum(HardwareKind)
  target?: HardwareKind;

  /** "true" | "false" as query string */
  @IsOptional()
  @IsBooleanString()
  isActive?: string;

  @IsOptional()
  @IsIn(['name', 'slug', 'weightInIndex', 'createdAt', 'vendor'])
  sortBy:
    | 'name'
    | 'slug'
    | 'weightInIndex'
    | 'createdAt'
    | 'vendor' = 'name';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';
}
