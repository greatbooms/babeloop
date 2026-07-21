import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { MediaAssetOrigin, User } from '../../../generated/prisma';
import { Int } from '@nestjs/graphql';
import { SimilarSourceAdModel } from '../source-ad/source-ad.models';
import { CurrentUser } from '../auth/current-user.decorator';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CompleteMediaUploadInput, MediaAssetFilterInput, RequestMediaUploadInput } from './media.inputs';
import {
  CompleteUploadModel,
  GenerateVideoThumbnailsPayload,
  MediaAssetModel,
  MediaAssetPageModel,
  UploadRequestModel,
} from './media.models';
import { JobModel } from '../jobs/job.model';
import { MediaService } from './media.service';

@Resolver(() => MediaAssetModel)
@UseGuards(GqlAuthGuard, RolesGuard)
export class MediaResolver {
  constructor(private readonly mediaService: MediaService) {}

  @Query(() => [MediaAssetModel])
  mediaAssets(@Args('origin', { type: () => MediaAssetOrigin, nullable: true }) origin?: MediaAssetOrigin) {
    return this.mediaService.findAll(origin);
  }

  @Query(() => MediaAssetPageModel)
  mediaAssetsPage(@Args('input') input: MediaAssetFilterInput) {
    return this.mediaService.findPage(input);
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

  @Mutation(() => JobModel)
  @Roles('ADMIN', 'EDITOR', 'REVIEWER')
  processMediaAsset(@Args('mediaAssetId', { type: () => ID }) mediaAssetId: string) {
    return this.mediaService.processMediaAsset(mediaAssetId);
  }

  @Mutation(() => JobModel)
  @Roles('ADMIN', 'EDITOR', 'REVIEWER')
  analyzeMediaAsset(@Args('mediaAssetId', { type: () => ID }) mediaAssetId: string) { return this.mediaService.analyzeMediaAsset(mediaAssetId); }

  @Query(() => [SimilarSourceAdModel])
  similarAdsForMediaAsset(@Args('mediaAssetId', { type: () => ID }) mediaAssetId: string, @Args('limit', { type: () => Int, defaultValue: 5 }) limit: number) { return this.mediaService.findSimilarAds(mediaAssetId, limit); }

  @Mutation(() => GenerateVideoThumbnailsPayload)
  @Roles('ADMIN')
  generateVideoThumbnails() {
    return this.mediaService.generateVideoThumbnails();
  }
}
