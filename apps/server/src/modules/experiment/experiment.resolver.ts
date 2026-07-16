import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { User } from '../../../generated/prisma';
import { CurrentUser } from '../auth/current-user.decorator';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  AddCreativeToExperimentInput,
  CreateExperimentInput,
  ExportExperimentInput,
} from './experiment.inputs';
import {
  ExperimentModel,
  ExperimentVariantModel,
  ExportPackageModel,
  ExportResultModel,
} from './experiment.models';
import { ExperimentService } from './experiment.service';
import { ExportService } from './export.service';

@Resolver(() => ExperimentModel)
@UseGuards(GqlAuthGuard, RolesGuard)
export class ExperimentResolver {
  constructor(
    private readonly experimentService: ExperimentService,
    private readonly exportService: ExportService,
  ) {}

  @Query(() => [ExperimentModel])
  experiments() {
    return this.experimentService.findAll();
  }

  @Query(() => [ExportPackageModel])
  exportPackages(@Args('experimentId', { type: () => ID }) experimentId: string) {
    return this.exportService.findPackages(experimentId);
  }

  @Mutation(() => ExperimentModel)
  @Roles('ADMIN', 'EDITOR', 'REVIEWER')
  createExperiment(@Args('input') input: CreateExperimentInput) {
    return this.experimentService.create(input);
  }

  @Mutation(() => ExperimentVariantModel)
  @Roles('ADMIN', 'EDITOR', 'REVIEWER')
  addCreativeToExperiment(@Args('input') input: AddCreativeToExperimentInput) {
    return this.experimentService.addCreative(input);
  }

  @Mutation(() => ExportResultModel)
  @Roles('ADMIN', 'EDITOR', 'REVIEWER')
  exportExperiment(@CurrentUser() user: User, @Args('input') input: ExportExperimentInput) {
    return this.exportService.exportExperiment(user, input.experimentId);
  }
}
