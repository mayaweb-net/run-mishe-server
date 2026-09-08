import { Module } from '@nestjs/common';
import { HardwareController } from './controllers/hardware.controller';
import { CpuService } from './cpu.service';
import { GpuService } from './gpu.service';

@Module({
  controllers: [HardwareController],
  providers: [CpuService, GpuService],
  exports: [CpuService, GpuService],
})
export class HardwareModule {}
