import { Field, ID, InputType } from '@nestjs/graphql';
import { MediaAssetKind } from '../../../generated/prisma';

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
