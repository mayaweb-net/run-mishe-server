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
import { GameService } from '@/app/modules/game/game.service';
import { ListGameQueryDto } from '@/app/modules/game/dto/list-game-query.dto';
import { CreateGameDto } from '@/app/modules/game/dto/create-game.dto';
import { UpdateGameDto } from '@/app/modules/game/dto/update-game.dto';

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
