import { Controller, Get, Query } from '@nestjs/common';
import { CpuService } from '../cpu.service';
import { GpuService } from '../gpu.service';
import { ListCpuQueryDto } from '../dto/list-cpu-query.dto';
import { ListGpuQueryDto } from '../dto/list-gpu-query.dto';

@Controller('hardware')
export class HardwareController {
  constructor(
    private readonly cpuService: CpuService,
    private readonly gpuService: GpuService,
  ) {}

  @Get('cpus')
  listCpus(@Query() query: ListCpuQueryDto) {
    return this.cpuService.list(query);
  }

  @Get('gpus')
  listGpus(@Query() query: ListGpuQueryDto) {
    return this.gpuService.list(query);
  }
}
