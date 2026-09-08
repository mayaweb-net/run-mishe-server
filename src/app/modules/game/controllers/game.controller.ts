import { Controller, Get, Query } from '@nestjs/common';
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
}
