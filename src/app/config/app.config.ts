import { registerAs } from '@nestjs/config';

export default registerAs('app', () => {
  const origins = [
    'http://localhost:4001',
    'https://localhost:4001',
    'http://127.0.0.1:4001',
    'https://127.0.0.1:4001',
    'http://localhost:4003',
    'http://127.0.0.1:4003',
    process.env.CORS_ORIGIN,
    process.env.CLIENT_ORIGIN,
  ].filter(Boolean) as string[];

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '4002', 10),
    globalPrefix: process.env.GLOBAL_PREFIX ?? 'api',
    cors: { origins },
    isProduction: (process.env.NODE_ENV ?? '') === 'production',
    clientRevalidateUrl: process.env.CLIENT_REVALIDATE_URL ?? '',
    revalidateSecret: process.env.REVALIDATE_SECRET ?? '',
  };
});
