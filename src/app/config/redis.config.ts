import { registerAs } from '@nestjs/config';

export default registerAs('redis', () => {
  const host = process.env.REDIS_HOST ?? 'localhost';
  const port = parseInt(process.env.REDIS_PORT ?? '6363', 10);
  const password = process.env.REDIS_PASSWORD || 'run-mishe';
  const auth = password ? `:${encodeURIComponent(password)}@` : '';
  return {
    host,
    port,
    password,
    connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT ?? '10000', 10),
    url: `redis://${auth}${host}:${port}`,
  };
});
