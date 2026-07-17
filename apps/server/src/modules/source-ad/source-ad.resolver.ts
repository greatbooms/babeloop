import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { User } from '../../../generated/prisma';
import { CurrentUser } from '../auth/current-user.decorator';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { JobModel } from '../jobs/job.model';
import { CsvImportService } from './csv-import.service';
import {
  AnalyzeSourceAdInput,
  CreateSourceAdInput,
  ImportSensorTowerCsvInput,
  SimilarSourceAdsInput,
} from './source-ad.inputs';
import {
  CreateSourceAdPayload,
  ImportResultModel,
  ReembedSourceAdsPayload,
  SimilarSourceAdModel,
  SourceAdModel,
} from './source-ad.models';
import { SourceAdService } from './source-ad.service';

@Resolver(() => SourceAdModel)
@UseGuards(GqlAuthGuard, RolesGuard)
export class SourceAdResolver {
  constructor(
    private readonly sourceAdService: SourceAdService,
    private readonly csvImportService: CsvImportService,
  ) {}

  @Query(() => [SourceAdModel])
  sourceAds() {
    return this.sourceAdService.findAll();
  }

  @Query(() => SourceAdModel)
  sourceAd(@Args('id', { type: () => ID }) id: string) {
    return this.sourceAdService.findById(id);
  }

  @Query(() => [SimilarSourceAdModel])
  similarSourceAds(@Args('input') input: SimilarSourceAdsInput) {
    return this.sourceAdService.findSimilar(input.sourceAdId, input.limit ?? 5);
  }

  @Mutation(() => CreateSourceAdPayload)
  @Roles('ADMIN', 'EDITOR', 'REVIEWER')
  createSourceAd(@CurrentUser() user: User, @Args('input') input: CreateSourceAdInput) {
    return this.sourceAdService.create(user, input);
  }

  @Mutation(() => JobModel)
  @Roles('ADMIN', 'EDITOR', 'REVIEWER')
  analyzeSourceAd(@Args('input') input: AnalyzeSourceAdInput) {
    return this.sourceAdService.analyze(input.sourceAdId);
  }

  @Mutation(() => ImportResultModel)
  @Roles('ADMIN', 'EDITOR', 'REVIEWER')
  importSensorTowerCsv(@Args('input') input: ImportSensorTowerCsvInput) {
    return this.csvImportService.importSensorTowerCsv(input.fileBase64, input.competitorId ?? undefined);
  }

  @Mutation(() => ReembedSourceAdsPayload)
  @Roles('ADMIN')
  reembedSourceAds() {
    return this.sourceAdService.reembedAnalyzed();
  }
}
