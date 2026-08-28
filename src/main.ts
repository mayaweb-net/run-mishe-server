import 'dotenv/config';
import { Logger } from '@nestjs/common';

import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app/app.module';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { registerApp } from './register';

const logger = new Logger('Bootstrap');
async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  const configService = app.get(ConfigService);
  await registerApp(app);

  const port = configService.getOrThrow<number>('app.port');
  await app.listen(port, '0.0.0.0');
  logger.log(`Server is running on http://localhost:${port}`);
}

await bootstrap();
