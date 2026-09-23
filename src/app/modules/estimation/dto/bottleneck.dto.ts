import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

/** Hardware-pair bottleneck — game is intentionally not part of the input. */
export class BottleneckDto {
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
