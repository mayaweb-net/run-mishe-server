import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class RunCheckDto {
  @IsOptional()
  @IsUUID()
  gameId?: string;

  @IsOptional()
  @IsString()
  gameSlug?: string;

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
}
