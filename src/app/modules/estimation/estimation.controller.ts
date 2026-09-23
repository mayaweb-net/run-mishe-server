import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { EstimationService } from './estimation.service';
import { BottleneckDto } from './dto/bottleneck.dto';
import { FpsEstimateDto } from './dto/fps-estimate.dto';
import { RunCheckDto } from './dto/run-check.dto';

@Controller()
export class EstimationController {
  constructor(private readonly estimationService: EstimationService) {}

  @Post('fps-estimate')
  estimate(@Body() dto: FpsEstimateDto) {
    return this.estimationService.estimateFps(dto);
  }

  @Post('run-check')
  runCheck(@Body() dto: RunCheckDto) {
    return this.estimationService.runCheck(dto);
  }

  @Post('bottleneck')
  bottleneck(@Body() dto: BottleneckDto) {
    return this.estimationService.bottleneck(dto);
  }

  @Get('checks/:code')
  getCheck(@Param('code') code: string) {
    return this.estimationService.getCheckSnapshot(code);
  }
}
