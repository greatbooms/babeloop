import { Global, Module } from '@nestjs/common';
import { VectorSearchRepository } from './vector-search.repository';
import { AnalysisService } from './analysis.service';

@Global()
@Module({
  providers: [AnalysisService, VectorSearchRepository],
  exports: [AnalysisService, VectorSearchRepository],
})
export class CreativeAnalysisModule {}
