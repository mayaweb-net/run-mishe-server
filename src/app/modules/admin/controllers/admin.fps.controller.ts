import { Controller, Get, Query } from '@nestjs/common';
import { EstimationService } from '@/app/modules/estimation/estimation.service';
import { ListFpsSampleQueryDto } from '@/app/modules/estimation/dto/list-fps-sample-query.dto';

@Controller('admin/fps-samples')
export class AdminFpsController {
  constructor(private readonly estimationService: EstimationService) {}

  @Get()
  list(@Query() query: ListFpsSampleQueryDto) {
    return this.estimationService.listFpsSamples(query);
  }
}
