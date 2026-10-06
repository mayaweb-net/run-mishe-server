import { Module } from '@nestjs/common';
import { CuratedController } from './controllers/curated.controller';
import { CuratedService } from './curated.service';

@Module({
  controllers: [CuratedController],
  providers: [CuratedService],
  exports: [CuratedService],
})
export class CuratedModule {}
