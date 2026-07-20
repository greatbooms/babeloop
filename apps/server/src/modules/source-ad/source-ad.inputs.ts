import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { MediaAssetKind, SourceAdStatus } from '../../../generated/prisma';

@InputType()
export class SourceAdFilterInput {
  @Field(() => Int, { defaultValue: 0 }) offset = 0;
  @Field(() => Int, { defaultValue: 24 }) limit = 24;
  @Field(() => SourceAdStatus, { nullable: true }) status?: SourceAdStatus;
  @Field(() => MediaAssetKind, { nullable: true }) kind?: MediaAssetKind;
  @Field(() => ID, { nullable: true }) competitorId?: string;
  @Field(() => String, { nullable: true }) search?: string;
}

@InputType()
export class CreateSourceAdInput {
  @Field(() => String, { nullable: true }) title?: string;
  @Field(() => String, { nullable: true }) adText?: string;
  @Field(() => String, { nullable: true }) sourceUrl?: string;
  @Field(() => ID, { nullable: true }) competitorId?: string;
}

@InputType()
export class AnalyzeSourceAdInput {
  @Field(() => ID) sourceAdId: string;
}

@InputType()
export class ImportSensorTowerCsvInput {
  @Field() fileBase64: string;
  @Field(() => ID, { nullable: true }) competitorId?: string;
}

@InputType()
export class SimilarSourceAdsInput {
  @Field(() => ID) sourceAdId: string;
  @Field(() => Int, { nullable: true }) limit?: number;
}
