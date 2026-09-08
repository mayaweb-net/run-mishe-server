import { PaginationQueryDto } from '@/app/common/dto/pagination-query.dto';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class ListBenchmarkScoreQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  benchmarkSlug?: string;

  @IsOptional()
  @IsIn(['score', 'capturedAt', 'hardwareName', 'benchmarkName', 'source'])
  sortBy:
    | 'score'
    | 'capturedAt'
    | 'hardwareName'
    | 'benchmarkName'
    | 'source' = 'score';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
