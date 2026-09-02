import { Module } from '@nestjs/common';
import { HardwareModule } from '@/app/modules/hardware/hardware.module';
import { AdminHardwareController } from './controllers/admin.hardware.controller';

@Module({
  imports: [HardwareModule],
  controllers: [AdminHardwareController],
})
export class AdminModule {}
