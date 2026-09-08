import { Module } from '@nestjs/common';
import { GameController } from './controllers/game.controller';
import { GameRequirementMatcherService } from './game-requirement-matcher.service';
import { GameService } from './game.service';

@Module({
  controllers: [GameController],
  providers: [GameService, GameRequirementMatcherService],
  exports: [GameService, GameRequirementMatcherService],
})
export class GameModule {}
