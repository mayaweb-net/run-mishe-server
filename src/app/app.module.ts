import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@/app/db/prisma/prisma.module';
import { configLoaders } from './config';
import { RedisModule } from './db/redis/redis.module';

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
    // ------------------
  ],
})
export class AppModule {}
