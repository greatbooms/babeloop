import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { MediaAssetKind, MediaAssetStatus } from '../../../generated/prisma';
import { JobModel } from '../jobs/job.model';
import { AdRefModel } from '../generation/brief.models';

registerEnumType(MediaAssetKind, { name: 'MediaAssetKind' });
registerEnumType(MediaAssetStatus, { name: 'MediaAssetStatus' });

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
