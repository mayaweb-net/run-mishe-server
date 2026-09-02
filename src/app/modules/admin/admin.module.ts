import { Module } from '@nestjs/common';
import { GameModule } from '@/app/modules/game/game.module';
import { HardwareModule } from '@/app/modules/hardware/hardware.module';
import { AdminGameController } from './controllers/admin.game.controller';
import { AdminHardwareController } from './controllers/admin.hardware.controller';

@Module({
  imports: [HardwareModule, GameModule],
  controllers: [AdminHardwareController, AdminGameController],
})
export class AdminModule {}
