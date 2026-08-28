import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly redis: Redis;

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.getOrThrow<string>('redis.url');
    this.redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      // Never return null — that permanently kills the client.
      retryStrategy: (times) => Math.min(times * 200, 30_000),
      reconnectOnError: (err) => {
        const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
        return targetErrors.some((code) => err.message.includes(code));
      },
    });

    this.redis.on('connect', () => {
      this.logger.log('Redis connected');
    });
    this.redis.on('ready', () => {
      this.logger.log('Redis ready');
    });
    this.redis.on('error', (err: Error) => {
      this.logger.error(`Redis error: ${err.message}`);
    });
    this.redis.on('close', () => {
      this.logger.warn('Redis connection closed');
    });
    this.redis.on('reconnecting', (delay: number) => {
      this.logger.warn(`Redis reconnecting in ${delay}ms`);
    });
    this.redis.on('end', () => {
      this.logger.error('Redis connection ended (no more reconnects)');
    });
  }

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds != null) {
      await this.redis.setex(key, ttlSeconds, value);
    } else {
      await this.redis.set(key, value);
    }
  }

  async del(key: string): Promise<number> {
    return this.redis.del(key);
  }

  async acquireLock(key: string, ttlSeconds: number): Promise<string | null> {
    const token = randomUUID();
    const result = await this.redis.set(key, token, 'EX', ttlSeconds, 'NX');
    return result === 'OK' ? token : null;
  }

  async releaseLock(key: string, token: string): Promise<boolean> {
    const released = await this.redis.eval(
      `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        end
        return 0
      `,
      1,
      key,
      token,
    );

    return released === 1;
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
