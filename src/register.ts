import { NestFastifyApplication } from '@nestjs/platform-fastify';
import compression from '@fastify/compress';
import cors from '@fastify/cors';
import fastifyCookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Nest's `register` and @fastify/* plugins often disagree on FastifyInstance
 * decorations (cookie/multipart/…). Cast keeps runtime the same and silences TS2345.
 */
type NestFastifyPlugin = Parameters<NestFastifyApplication['register']>[0];

function nestPlugin(plugin: unknown): NestFastifyPlugin {
  return plugin as NestFastifyPlugin;
}

export async function registerApp(app: NestFastifyApplication): Promise<void> {
  const configService = app.get(ConfigService);

  await app.register(nestPlugin(cors), {
    origin: configService.getOrThrow<string[]>('app.cors.origins'),
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin'],
  });
  await app.register(nestPlugin(compression));
  await app.register(nestPlugin(helmet), {
    // Allow admin (and other origins) to load /api/files/* in <img>/editor.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });
  await app.register(nestPlugin(fastifyCookie), {
    secret: configService.get('app.cookieSecret') ?? 'yotal-cookie-secret',
  });
  await app.register(nestPlugin(multipart), {
    limits: { fileSize: 50 * 1024 * 1024, files: 3 },
  });
  await app.register(nestPlugin(rateLimit), {
    max: Number(process.env.RATE_LIMIT_MAX) || 100,
    timeWindow: process.env.RATE_LIMIT_WINDOW ?? '1 minute',
  });
  app.setGlobalPrefix(configService.getOrThrow<string>('app.globalPrefix'));

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  );
}
