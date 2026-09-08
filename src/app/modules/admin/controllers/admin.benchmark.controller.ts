import { Controller, Get, Query } from '@nestjs/common';
import { BenchmarkService } from '@/app/modules/benchmark/benchmark.service';
import { ListBenchmarkQueryDto } from '@/app/modules/benchmark/dto/list-benchmark-query.dto';
import { ListBenchmarkScoreQueryDto } from '@/app/modules/benchmark/dto/list-benchmark-score-query.dto';

@Controller('admin/benchmarks')
export class AdminBenchmarkController {
  constructor(private readonly benchmarkService: BenchmarkService) {}

  @Get()
  listDefinitions(@Query() query: ListBenchmarkQueryDto) {
    return this.benchmarkService.listDefinitions(query);
  }

  @Get('cpu-scores')
  listCpuScores(@Query() query: ListBenchmarkScoreQueryDto) {
    return this.benchmarkService.listCpuScores(query);
  }

  @Get('gpu-scores')
  listGpuScores(@Query() query: ListBenchmarkScoreQueryDto) {
    return this.benchmarkService.listGpuScores(query);
  }
}
