import { IsIn, IsOptional } from 'class-validator';

export class UnmatchedRequirementsReportQueryDto {
  @IsOptional()
  @IsIn(['json', 'csv'])
  format?: 'json' | 'csv' = 'json';
}
