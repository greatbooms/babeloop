import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { MediaAssetKind, MediaAssetOrigin, MediaAssetStatus } from '../../../generated/prisma';
import { JobModel } from '../jobs/job.model';
import { AdRefModel } from '../generation/brief.models';

registerEnumType(MediaAssetKind, { name: 'MediaAssetKind' });
registerEnumType(MediaAssetStatus, { name: 'MediaAssetStatus' });
registerEnumType(MediaAssetOrigin, { name: 'MediaAssetOrigin' });

@ObjectType()
export class MediaInsightModel {
  @Field(() => ID) id: string;
  @Field() summary: string;
  @Field() hookType: string;
  @Field(() => [String]) targetAudience: string[];
  @Field(() => [String]) emotionalTriggers: string[];
  @Field(() => [String]) genres: string[];
  @Field(() => String, { nullable: true }) zhTwJson: string | null;
  @Field() provider: string;
  @Field() model: string;
  @Field() promptVersion: string;
  @Field() createdAt: Date;
}

@ObjectType()
export class OcrResultModel {
  @Field(() => ID) id: string;
  @Field() text: string;
  @Field() provider: string;
  @Field() model: string;
}

@ObjectType()
export class TranscriptionModel {
  @Field(() => ID) id: string;
  @Field() text: string;
  @Field(() => String, { nullable: true }) language: string | null;
  @Field() provider: string;
  @Field() model: string;
}

@ObjectType()
export class MediaAssetModel {
  @Field(() => ID) id: string;
  @Field(() => MediaAssetKind) kind: MediaAssetKind;
  @Field(() => MediaAssetStatus) status: MediaAssetStatus;
  @Field(() => MediaAssetOrigin) origin: MediaAssetOrigin;
  @Field() originalFilename: string;
  @Field() contentType: string;
  @Field(() => Int, { nullable: true }) sizeBytes: number | null;
  @Field(() => String, { nullable: true }) duplicateOfId: string | null;
  @Field() storageKey: string;
  @Field(() => String, { nullable: true }) thumbnailKey?: string | null;
  @Field(() => String, { nullable: true }) thumbnailUrl?: string | null;
  @Field() mediaUrl: string;
  @Field() createdAt: Date;
  @Field(() => [OcrResultModel]) ocrResults: OcrResultModel[];
  @Field(() => [TranscriptionModel]) transcriptions: TranscriptionModel[];
  @Field(() => [AdRefModel]) linkedSourceAds: AdRefModel[];
  @Field(() => [MediaInsightModel]) insights: MediaInsightModel[];
}

@ObjectType()
export class MediaAssetPageModel {
  @Field(() => Int) totalCount: number;
  @Field(() => [MediaAssetModel]) items: MediaAssetModel[];
}

@ObjectType()
export class GenerateVideoThumbnailsPayload {
  @Field(() => Int) enqueued: number;
}

@ObjectType()
export class UploadRequestModel {
  @Field() uploadUrl: string;
  @Field(() => MediaAssetModel) mediaAsset: MediaAssetModel;
}

@ObjectType()
export class CompleteUploadModel {
  @Field(() => MediaAssetModel) mediaAsset: MediaAssetModel;
  @Field(() => JobModel) job: JobModel;
}
