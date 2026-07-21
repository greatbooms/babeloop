import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { MediaAssetKind, MediaAssetOrigin } from '../../../generated/prisma';

@InputType()
export class MediaAssetFilterInput {
  @Field(() => MediaAssetOrigin, { nullable: true }) origin?: MediaAssetOrigin;
  @Field(() => MediaAssetKind, { nullable: true }) kind?: MediaAssetKind;
  @Field(() => String, { nullable: true }) search?: string;
  @Field(() => Int, { defaultValue: 0 }) offset: number;
  @Field(() => Int, { defaultValue: 24 }) limit: number;
}

@InputType()
export class RequestMediaUploadInput {
  @Field() filename: string;
  @Field() contentType: string;
  @Field(() => MediaAssetKind) kind: MediaAssetKind;
}

@InputType()
export class CompleteMediaUploadInput {
  @Field(() => ID) mediaAssetId: string;
}
