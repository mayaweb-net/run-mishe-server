import { Module } from '@nestjs/common';
import { CpuService } from './cpu.service';
import { GpuService } from './gpu.service';

@Module({
  providers: [CpuService, GpuService],
  exports: [CpuService, GpuService],
})
export class HardwareModule {}
