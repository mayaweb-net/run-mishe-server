import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@/app/db/prisma/prisma.module';
import { configLoaders } from './config';
import { RedisModule } from './db/redis/redis.module';
import { AdminModule } from './modules/admin/admin.module';
import { EstimationModule } from './modules/estimation/estimation.module';
import { GameModule } from './modules/game/game.module';
import { HardwareModule } from './modules/hardware/hardware.module';

@Module({
  imports: [
    // GLOBAL MODULES
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: configLoaders,
    }),
    PrismaModule,
    RedisModule,
    // FEATURE MODULES
    HardwareModule,
    GameModule,
    EstimationModule,
    AdminModule,
    // ------------------
  ],
})
export class AppModule {}
