import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CreativeStatus, User } from '../../../generated/prisma';
import { CurrentUser } from '../auth/current-user.decorator';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { JobModel } from '../jobs/job.model';
import {
  CreativeIdInput,
  CreativeNoteInput,
  CreativeReasonInput,
  ReviseLocalizationInput,
  UpdateCreativeTextInput,
} from './review.inputs';
import { CreativeDetailModel } from './review.models';
import { ReviewService } from './review.service';

@Resolver(() => CreativeDetailModel)
@UseGuards(GqlAuthGuard, RolesGuard)
export class ReviewResolver {
  constructor(private readonly reviewService: ReviewService) {}

  @Query(() => [CreativeDetailModel])
  creatives(
    @Args('status', { type: () => CreativeStatus, nullable: true }) status?: CreativeStatus,
  ) {
    return this.reviewService.findAll(status);
  }

  @Mutation(() => JobModel)
  @Roles('ADMIN', 'EDITOR', 'REVIEWER')
  runPolicyCheck(@CurrentUser() user: User, @Args('input') input: CreativeIdInput) {
    return this.reviewService.runPolicyCheck(user, input.creativeId);
  }

  @Mutation(() => CreativeDetailModel)
  @Roles('ADMIN', 'EDITOR', 'REVIEWER')
  requestCreativeReview(@CurrentUser() user: User, @Args('input') input: CreativeIdInput) {
    return this.reviewService.requestReview(user, input.creativeId);
  }

  @Mutation(() => CreativeDetailModel)
  @Roles('ADMIN', 'EDITOR', 'REVIEWER')
  reviseLocalization(@CurrentUser() user: User, @Args('input') input: ReviseLocalizationInput) {
    return this.reviewService.reviseLocalization(user, input.creativeId, input.text, input.note);
  }

  @Mutation(() => CreativeDetailModel)
  @Roles('ADMIN', 'REVIEWER')
  approveLocalization(@CurrentUser() user: User, @Args('input') input: CreativeNoteInput) {
    return this.reviewService.approveLocalization(user, input.creativeId, input.note);
  }

  @Mutation(() => CreativeDetailModel)
  @Roles('ADMIN', 'REVIEWER')
  approveCreative(@CurrentUser() user: User, @Args('input') input: CreativeNoteInput) {
    return this.reviewService.approveCreative(user, input.creativeId, input.note);
  }

  @Mutation(() => CreativeDetailModel)
  @Roles('ADMIN', 'EDITOR', 'REVIEWER')
  requestCreativeRevision(@CurrentUser() user: User, @Args('input') input: CreativeReasonInput) {
    return this.reviewService.requestRevision(user, input.creativeId, input.reason);
  }

  @Mutation(() => CreativeDetailModel)
  @Roles('ADMIN', 'EDITOR', 'REVIEWER')
  rejectCreative(@CurrentUser() user: User, @Args('input') input: CreativeReasonInput) {
    return this.reviewService.rejectCreative(user, input.creativeId, input.reason);
  }

  @Mutation(() => CreativeDetailModel)
  @Roles('ADMIN', 'EDITOR', 'REVIEWER')
  updateCreativeText(@CurrentUser() user: User, @Args('input') input: UpdateCreativeTextInput) {
    return this.reviewService.updateCreativeText(user, input.creativeId, input.koreanText);
  }

  @Mutation(() => CreativeDetailModel)
  @Roles('ADMIN', 'REVIEWER')
  releaseMinorFlag(@CurrentUser() user: User, @Args('input') input: CreativeReasonInput) {
    return this.reviewService.releaseMinorFlag(user, input.creativeId, input.reason);
  }
}
