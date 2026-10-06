import { Module } from '@nestjs/common';
import { EstimationModule } from '@/app/modules/estimation/estimation.module';
import { HardwareController } from './controllers/hardware.controller';
import { CpuService } from './cpu.service';
import { GpuMatrixService } from './gpu-matrix.service';
import { GpuService } from './gpu.service';

@Module({
  imports: [EstimationModule],
  controllers: [HardwareController],
  providers: [CpuService, GpuService, GpuMatrixService],
  exports: [CpuService, GpuService, GpuMatrixService],
})
export class HardwareModule {}
