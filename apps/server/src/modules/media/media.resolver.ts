import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { User } from '../../../generated/prisma';
import { CurrentUser } from '../auth/current-user.decorator';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CompleteMediaUploadInput, RequestMediaUploadInput } from './media.inputs';
import { CompleteUploadModel, MediaAssetModel, UploadRequestModel } from './media.models';
import { MediaService } from './media.service';

@Resolver(() => MediaAssetModel)
@UseGuards(GqlAuthGuard, RolesGuard)
export class MediaResolver {
  constructor(private readonly mediaService: MediaService) {}

  @Query(() => [MediaAssetModel])
  mediaAssets() {
    return this.mediaService.findAll();
  }

  @Query(() => MediaAssetModel)
  mediaAsset(@Args('id', { type: () => ID }) id: string) {
    return this.mediaService.findById(id);
  }

  @Mutation(() => UploadRequestModel)
  @Roles('ADMIN', 'EDITOR', 'REVIEWER')
  requestMediaUpload(@CurrentUser() user: User, @Args('input') input: RequestMediaUploadInput) {
    return this.mediaService.requestUpload(user, input);
  }

  @Mutation(() => CompleteUploadModel)
  @Roles('ADMIN', 'EDITOR', 'REVIEWER')
  completeMediaUpload(@Args('input') input: CompleteMediaUploadInput) {
    return this.mediaService.completeUpload(input);
  }
}
