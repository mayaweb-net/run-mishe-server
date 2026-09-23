import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { PrismaService } from '@/app/db/prisma/prisma.service';
import { EstimationService } from '@/app/modules/estimation/estimation.service';
import { runCalibrationJob } from '@/app/modules/estimation/calibration.job';
import { ListFpsSampleQueryDto } from '@/app/modules/estimation/dto/list-fps-sample-query.dto';
import { CreateFpsSamplesDto } from '@/app/modules/estimation/dto/create-fps-samples.dto';
import { UpdateFpsSampleDto } from '@/app/modules/estimation/dto/update-fps-sample.dto';

class CalibrateFpsBodyDto {
  @IsOptional()
  @IsUUID()
  gameId?: string;

  @IsOptional()
  @IsString()
  gameSlug?: string;
}

@Controller('admin/fps-samples')
export class AdminFpsController {
  constructor(
    private readonly estimationService: EstimationService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  list(@Query() query: ListFpsSampleQueryDto) {
    return this.estimationService.listFpsSamples(query);
  }

  @Post()
  create(@Body() dto: CreateFpsSamplesDto) {
    return this.estimationService.createManualFpsSamples(dto);
  }

  /** Fit GameProfile / GameScaling from current FpsSample rows. */
  @Post('calibrate')
  async calibrate(@Body() body: CalibrateFpsBodyDto = {}) {
    let gameSlug = body.gameSlug;
    if (!gameSlug && body.gameId) {
      const game = await this.prisma.game.findUnique({
        where: { id: body.gameId },
        select: { slug: true },
      });
      gameSlug = game?.slug;
    }

    const summary = await runCalibrationJob(this.prisma, {
      gameSlug,
    });

    return {
      calibrationVersion: summary.calibrationVersion,
      totalGames: summary.totalGames,
      calibrated: summary.calibrated,
      skipped: summary.skipped,
      rejected: summary.rejected,
      outcomes: summary.outcomes
        .filter((row) => row.status !== 'skipped' || row.sampleCount > 0)
        .slice(0, 30)
        .map((row) => ({
          slug: row.slug,
          name: row.name,
          status: row.status,
          sampleCount: row.sampleCount,
          holdoutMape: row.holdoutMape,
          reason: row.reason,
        })),
    };
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFpsSampleDto,
  ) {
    return this.estimationService.updateFpsSample(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.estimationService.deleteFpsSample(id);
  }
}
