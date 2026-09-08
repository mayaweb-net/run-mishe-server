import { Module } from '@nestjs/common';
import { BenchmarkModule } from '@/app/modules/benchmark/benchmark.module';
import { EstimationModule } from '@/app/modules/estimation/estimation.module';
import { GameModule } from '@/app/modules/game/game.module';
import { HardwareModule } from '@/app/modules/hardware/hardware.module';
import { AdminBenchmarkController } from './controllers/admin.benchmark.controller';
import { AdminGameController } from './controllers/admin.game.controller';
import { AdminHardwareController } from './controllers/admin.hardware.controller';

@Module({
  imports: [HardwareModule, GameModule, BenchmarkModule, EstimationModule],
  controllers: [
    AdminHardwareController,
    AdminGameController,
    AdminBenchmarkController,
  ],
})
export class AdminModule {}
