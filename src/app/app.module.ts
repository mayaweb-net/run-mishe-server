import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@/app/db/prisma/prisma.module';
import { configLoaders } from './config';
import { RedisModule } from './db/redis/redis.module';
import { AdminModule } from './modules/admin/admin.module';
import { ArticleModule } from './modules/article/article.module';
import { CuratedModule } from './modules/curated/curated.module';
import { EstimationModule } from './modules/estimation/estimation.module';
import { GameModule } from './modules/game/game.module';
import { HardwareModule } from './modules/hardware/hardware.module';
import { UploadModule } from './modules/upload/upload.module';

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
    UploadModule,
    // FEATURE MODULES
    HardwareModule,
    GameModule,
    EstimationModule,
    CuratedModule,
    ArticleModule,
    AdminModule,
    // ------------------
  ],
})
export class AppModule {}