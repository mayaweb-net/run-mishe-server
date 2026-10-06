import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { CuratedService } from '@/app/modules/curated/curated.service';
import {
  AddCuratedCpuDto,
  AddCuratedGameDto,
  AddCuratedGpuDto,
  ReorderCuratedListDto,
} from '@/app/modules/curated/dto/curated.dto';

@Controller('admin/curated')
export class AdminCuratedController {
  constructor(private readonly curatedService: CuratedService) {}

  @Get('games')
  listGames() {
    return this.curatedService.listTopGames();
  }

  @Post('games')
  addGame(@Body() body: AddCuratedGameDto) {
    return this.curatedService.addTopGame(body.gameId);
  }

  @Put('games/order')
  reorderGames(@Body() body: ReorderCuratedListDto) {
    return this.curatedService.reorderTopGames(body.orderedIds);
  }

  @Delete('games/:gameId')
  removeGame(@Param('gameId', ParseUUIDPipe) gameId: string) {
    return this.curatedService.removeTopGame(gameId);
  }

  @Get('cpus')
  listCpus() {
    return this.curatedService.listTopCpus();
  }

  @Post('cpus')
  addCpu(@Body() body: AddCuratedCpuDto) {
    return this.curatedService.addTopCpu(body.cpuId);
  }

  @Put('cpus/order')
  reorderCpus(@Body() body: ReorderCuratedListDto) {
    return this.curatedService.reorderTopCpus(body.orderedIds);
  }

  @Delete('cpus/:cpuId')
  removeCpu(@Param('cpuId', ParseUUIDPipe) cpuId: string) {
    return this.curatedService.removeTopCpu(cpuId);
  }

  @Get('gpus')
  listGpus() {
    return this.curatedService.listTopGpus();
  }

  @Post('gpus')
  addGpu(@Body() body: AddCuratedGpuDto) {
    return this.curatedService.addTopGpu(body.gpuId);
  }

  @Put('gpus/order')
  reorderGpus(@Body() body: ReorderCuratedListDto) {
    return this.curatedService.reorderTopGpus(body.orderedIds);
  }

  @Delete('gpus/:gpuId')
  removeGpu(@Param('gpuId', ParseUUIDPipe) gpuId: string) {
    return this.curatedService.removeTopGpu(gpuId);
  }
}
