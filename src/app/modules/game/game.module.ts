import { Module } from '@nestjs/common';
import { GameRequirementMatcherService } from './game-requirement-matcher.service';
import { GameService } from './game.service';

@Module({
  providers: [GameService, GameRequirementMatcherService],
  exports: [GameService, GameRequirementMatcherService],
})
export class GameModule {}
