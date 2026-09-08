import { Module } from '@nestjs/common';
import { EstimationController } from './estimation.controller';
import { EstimationService } from './estimation.service';

@Module({
  controllers: [EstimationController],
  providers: [EstimationService],
  exports: [EstimationService],
})
export class EstimationModule {}
