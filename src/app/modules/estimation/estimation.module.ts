import { Module } from '@nestjs/common';
import { EstimationService } from './estimation.service';

@Module({
  providers: [EstimationService],
  exports: [EstimationService],
})
export class EstimationModule {}
