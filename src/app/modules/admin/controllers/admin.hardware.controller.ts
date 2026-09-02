import { Controller, Get, Query } from '@nestjs/common';
import { CpuService } from '@/app/modules/hardware/cpu.service';
import { GpuService } from '@/app/modules/hardware/gpu.service';
import { ListCpuQueryDto } from '@/app/modules/hardware/dto/list-cpu-query.dto';
import { ListGpuQueryDto } from '@/app/modules/hardware/dto/list-gpu-query.dto';

@Controller('admin/hardware')
export class AdminHardwareController {
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
