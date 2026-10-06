import { Controller, Get } from '@nestjs/common';
import { CuratedService } from '../curated.service';

@Controller('curated')
export class CuratedController {
  constructor(private readonly curatedService: CuratedService) {}

  @Get('games')
  listGames() {
    return this.curatedService.listTopGames();
  }

  @Get('cpus')
  listCpus() {
    return this.curatedService.listTopCpus();
  }

  @Get('gpus')
  listGpus() {
    return this.curatedService.listTopGpus();
  }
}
