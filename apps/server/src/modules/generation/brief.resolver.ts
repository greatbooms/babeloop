import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { User } from '../../../generated/prisma';
import { CurrentUser } from '../auth/current-user.decorator';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  GenerateBriefFromPerformanceInput,
  GenerateCreativeBriefInput,
  GenerateCreativeVariantsInput,
} from './brief.inputs';
import { CreativeBriefModel, GenerateJobPayload } from './brief.models';
import { BriefService } from './brief.service';

@Resolver(() => CreativeBriefModel)
@UseGuards(GqlAuthGuard, RolesGuard)
export class BriefResolver {
  constructor(private readonly briefService: BriefService) {}

  @Query(() => [CreativeBriefModel])
  creativeBriefs() {
    return this.briefService.findAll();
  }

  @Query(() => CreativeBriefModel)
  creativeBrief(@Args('id', { type: () => ID }) id: string) {
    return this.briefService.findById(id);
  }

  @Mutation(() => GenerateJobPayload)
  @Roles('ADMIN', 'EDITOR', 'REVIEWER')
  generateCreativeBrief(
    @CurrentUser() user: User,
    @Args('input') input: GenerateCreativeBriefInput,
  ) {
    return this.briefService.requestBrief(user, input);
  }

  @Mutation(() => GenerateJobPayload)
  @Roles('ADMIN', 'EDITOR', 'REVIEWER')
  generateCreativeVariants(@Args('input') input: GenerateCreativeVariantsInput) {
    return this.briefService.requestVariants(input);
  }

  @Mutation(() => GenerateJobPayload)
  @Roles('ADMIN', 'EDITOR', 'REVIEWER')
  generateBriefFromPerformance(
    @CurrentUser() user: User,
    @Args('input') input: GenerateBriefFromPerformanceInput,
  ) {
    return this.briefService.requestBriefFromPerformance(user, input.experimentId);
  }
}
