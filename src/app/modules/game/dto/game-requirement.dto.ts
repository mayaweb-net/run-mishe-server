import { RequirementTier } from '@/app/db/generated/prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class GameRequirementInputDto {
  @IsEnum(RequirementTier)
  tier!: RequirementTier;

  @IsOptional()
  @IsUUID()
  cpuId?: string | null;

  @IsOptional()
  @IsUUID()
  gpuId?: string | null;

  @IsOptional()
  @IsString()
  rawCpuText?: string | null;
  @IsOptional()
  @IsString()
  rawGpuText?: string | null;

  @IsOptional()
  @IsString()
  os?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ramGb?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  vramGb?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storageGb?: number | null;

  @IsOptional()
  @IsString()
  directX?: string | null;

  @IsOptional()
  @IsBoolean()
  needsSsd?: boolean;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
