import { Body, Controller, Post } from '@nestjs/common';
import { EstimationService } from './estimation.service';
import { FpsEstimateDto } from './dto/fps-estimate.dto';

@Controller()
export class EstimationController {
  constructor(private readonly estimationService: EstimationService) {}

  @Post('fps-estimate')
  estimate(@Body() dto: FpsEstimateDto) {
    return this.estimationService.estimateFps(dto);
  }
}
