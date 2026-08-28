import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/app/db/generated/prisma/client';

function createPgAdapter() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }

  return new PrismaPg({ connectionString: databaseUrl });
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({ adapter: createPgAdapter() });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('PostgreSQL connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
