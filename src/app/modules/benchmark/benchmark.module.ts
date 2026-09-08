import { Module } from '@nestjs/common';
import { BenchmarkService } from './benchmark.service';

/**
 * Nest domain module for benchmark catalogue/score queries.
 * Crawl/import CLIs under this folder stay independent of Nest DI.
 */
@Module({
  providers: [BenchmarkService],
  exports: [BenchmarkService],
})
export class BenchmarkModule {}
