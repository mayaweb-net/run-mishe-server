import { Controller, Get, Param, Query } from '@nestjs/common';
import { CpuMatrixService } from '../cpu-matrix.service';
import { CpuService } from '../cpu.service';
import { GpuMatrixService } from '../gpu-matrix.service';
import { GpuService } from '../gpu.service';
import { CpuMatrixQueryDto } from '../dto/cpu-matrix-query.dto';
import { GpuMatrixQueryDto } from '../dto/gpu-matrix-query.dto';
import { ListCpuQueryDto } from '../dto/list-cpu-query.dto';
import { ListGpuQueryDto } from '../dto/list-gpu-query.dto';

@Controller('hardware')
export class HardwareController {
  constructor(
    private readonly cpuService: CpuService,
    private readonly gpuService: GpuService,
    private readonly cpuMatrixService: CpuMatrixService,
    private readonly gpuMatrixService: GpuMatrixService,
  ) {}

  @Get('cpus/matrix')
  cpuMatrix(@Query() query: CpuMatrixQueryDto) {
    return this.cpuMatrixService.getMatrix(query);
  }

  @Get('cpus')
  listCpus(@Query() query: ListCpuQueryDto) {
    return this.cpuService.list(query);
  }

  @Get('cpus/:slug')
  getCpuBySlug(@Param('slug') slug: string) {
    return this.cpuService.findBySlug(slug);
  }

  @Get('gpus/matrix')
  gpuMatrix(@Query() query: GpuMatrixQueryDto) {
    return this.gpuMatrixService.getMatrix(query);
  }

  @Get('gpus')
  listGpus(@Query() query: ListGpuQueryDto) {
    return this.gpuService.list(query);
  }

  @Get('gpus/:slug')
  getGpuBySlug(@Param('slug') slug: string) {
    return this.gpuService.findBySlug(slug);
  }
}
