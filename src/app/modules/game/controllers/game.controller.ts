import { Controller, Get, Param, Query } from '@nestjs/common';
import { GameService } from '../game.service';
import { ListGameQueryDto } from '../dto/list-game-query.dto';

@Controller('games')
export class GameController {
  constructor(private readonly gameService: GameService) {}

  @Get()
  list(@Query() query: ListGameQueryDto) {
    return this.gameService.list({
      ...query,
      isPublished: true,
    });
  }

  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.gameService.findPublishedBySlug(slug);
  }
}
