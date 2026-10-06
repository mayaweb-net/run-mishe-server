import { IsArray, IsUUID } from 'class-validator';

export class AddCuratedGameDto {
  @IsUUID()
  gameId!: string;
}

export class AddCuratedCpuDto {
  @IsUUID()
  cpuId!: string;
}

export class AddCuratedGpuDto {
  @IsUUID()
  gpuId!: string;
}

export class ReorderCuratedListDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  orderedIds!: string[];
}
