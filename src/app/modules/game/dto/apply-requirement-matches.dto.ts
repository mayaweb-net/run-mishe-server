import { HardwareKind, RequirementTier } from '@/app/db/generated/prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class ApplyRequirementMatchItemDto {
  @IsEnum(RequirementTier)
  tier!: RequirementTier;

  @IsEnum(HardwareKind)
  kind!: HardwareKind;

  @IsUUID()
  hardwareId!: string;
}

export class ApplyRequirementMatchesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApplyRequirementMatchItemDto)
  matches!: ApplyRequirementMatchItemDto[];
}
