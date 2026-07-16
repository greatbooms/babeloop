import { Field, ID, InputType, Int } from '@nestjs/graphql';

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
