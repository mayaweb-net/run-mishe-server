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
  StreamableFile,
} from '@nestjs/common';
import { Readable } from 'node:stream';
import { GameService } from '@/app/modules/game/game.service';
import { ListGameQueryDto } from '@/app/modules/game/dto/list-game-query.dto';
import { CreateGameDto } from '@/app/modules/game/dto/create-game.dto';
import { UpdateGameDto } from '@/app/modules/game/dto/update-game.dto';
import { ApplyRequirementMatchesDto } from '@/app/modules/game/dto/apply-requirement-matches.dto';
import { UnmatchedRequirementsReportQueryDto } from '@/app/modules/game/dto/unmatched-requirements-report-query.dto';
import { formatUnmatchedRequirementsCsv } from '@/app/modules/game/game-unmatched-report.types';

@Controller('admin/games')
export class AdminGameController {
  constructor(private readonly gameService: GameService) {}

  @Get()
  listGames(@Query() query: ListGameQueryDto) {
    return this.gameService.list(query);
  }

  @Post()
  createGame(@Body() body: CreateGameDto) {
    return this.gameService.create(body);
  }

  @Get('unmatched-requirements-report')
  async unmatchedRequirementsReport(
    @Query() query: UnmatchedRequirementsReportQueryDto,
  ): Promise<StreamableFile | Awaited<ReturnType<GameService['getUnmatchedRequirementsReport']>>> {
    const report = await this.gameService.getUnmatchedRequirementsReport();

    if (query.format === 'csv') {
      const date = report.generatedAt.slice(0, 10);
      const csv = formatUnmatchedRequirementsCsv(report);

      return new StreamableFile(Readable.from([csv]), {
        type: 'text/csv; charset=utf-8',
        disposition: `attachment; filename="unmatched-requirements-${date}.csv"`,
      });
    }

    return report;
  }

  @Get(':id/requirement-suggestions')
  suggestRequirementMatches(@Param('id', ParseUUIDPipe) id: string) {
    return this.gameService.suggestRequirementMatches(id);
  }

  @Post(':id/apply-requirement-matches')
  applyRequirementMatches(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ApplyRequirementMatchesDto,
  ) {
    return this.gameService.applyRequirementMatches(id, body);
  }

  @Get(':id')
  getGame(@Param('id', ParseUUIDPipe) id: string) {
    return this.gameService.findById(id);
  }

  @Patch(':id')
  updateGame(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateGameDto,
  ) {
    return this.gameService.update(id, body);
  }

  @Delete(':id')
  deleteGame(@Param('id', ParseUUIDPipe) id: string) {
    return this.gameService.remove(id);
  }
}
