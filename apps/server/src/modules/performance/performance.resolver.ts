import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { User } from '../../../generated/prisma';
import { CurrentUser } from '../auth/current-user.decorator';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { JobModel } from '../jobs/job.model';
import { ImportPerformanceCsvInput, SyncPerformanceFromSnowflakeInput } from './performance.inputs';
import {
  PerformanceImportModel,
  PerformanceImportResultModel,
  PerformanceSyncStatusModel,
  VariantPerformanceModel,
} from './performance.models';
import { PerformanceService } from './performance.service';

@Resolver()
@UseGuards(GqlAuthGuard, RolesGuard)
export class PerformanceResolver {
  constructor(private readonly performanceService: PerformanceService) {}

  @Mutation(() => PerformanceImportResultModel)
  @Roles('ADMIN', 'EDITOR', 'REVIEWER')
  importPerformanceCsv(
    @CurrentUser() user: User,
    @Args('input') input: ImportPerformanceCsvInput,
  ) {
    return this.performanceService.importCsv(user, input.fileBase64, input.filename);
  }

  @Mutation(() => JobModel)
  @Roles('ADMIN', 'EDITOR', 'REVIEWER')
  syncPerformanceFromSnowflake(
    @CurrentUser() user: User,
    @Args('input', { nullable: true }) input?: SyncPerformanceFromSnowflakeInput,
  ) {
    return this.performanceService.syncFromSnowflake(user, input);
  }

  @Query(() => PerformanceSyncStatusModel)
  performanceSyncStatus() {
    return this.performanceService.performanceSyncStatus();
  }

  @Query(() => [VariantPerformanceModel])
  variantPerformance(@Args('experimentId', { type: () => ID }) experimentId: string) {
    return this.performanceService.variantPerformance(experimentId);
  }

  @Query(() => [PerformanceImportModel])
  performanceImports() {
    return this.performanceService.findImports();
  }
}
