import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CpuService } from '@/app/modules/hardware/cpu.service';
import { GpuService } from '@/app/modules/hardware/gpu.service';
import { ListCpuQueryDto } from '@/app/modules/hardware/dto/list-cpu-query.dto';
import { ListGpuQueryDto } from '@/app/modules/hardware/dto/list-gpu-query.dto';
import { CreateCpuDto } from '@/app/modules/hardware/dto/create-cpu.dto';
import { CreateGpuDto } from '@/app/modules/hardware/dto/create-gpu.dto';
import { UpdateCpuDto } from '@/app/modules/hardware/dto/update-cpu.dto';
import { UpdateGpuDto } from '@/app/modules/hardware/dto/update-gpu.dto';

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

  @Post('cpus')
  createCpu(@Body() body: CreateCpuDto) {
    return this.cpuService.create(body);
  }

  @Get('cpus/:id')
  getCpu(@Param('id', ParseUUIDPipe) id: string) {
    return this.cpuService.findById(id);
  }

  @Patch('cpus/:id')
  updateCpu(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCpuDto,
  ) {
    return this.cpuService.update(id, body);
  }

  @Delete('cpus/:id')
  deleteCpu(@Param('id', ParseUUIDPipe) id: string) {
    return this.cpuService.remove(id);
  }

  @Get('gpus')
  listGpus(@Query() query: ListGpuQueryDto) {
    return this.gpuService.list(query);
  }

  @Post('gpus')
  createGpu(@Body() body: CreateGpuDto) {
    return this.gpuService.create(body);
  }

  @Get('gpus/:id')
  getGpu(@Param('id', ParseUUIDPipe) id: string) {
    return this.gpuService.findById(id);
  }

  @Patch('gpus/:id')
  updateGpu(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateGpuDto,
  ) {
    return this.gpuService.update(id, body);
  }

  @Delete('gpus/:id')
  deleteGpu(@Param('id', ParseUUIDPipe) id: string) {
    return this.gpuService.remove(id);
  }
}
