import { Field, Float, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { Confidence, SourceAdOrigin, SourceAdStatus } from '../../../generated/prisma';
import { CompetitorModel } from '../competitor/competitor.model';
import { JobModel } from '../jobs/job.model';
import { MediaAssetModel } from '../media/media.models';

registerEnumType(SourceAdOrigin, { name: 'SourceAdOrigin' });
registerEnumType(SourceAdStatus, { name: 'SourceAdStatus' });
registerEnumType(Confidence, { name: 'Confidence' });

@ObjectType()
export class CreativeAnalysisModel {
  @Field(() => ID) id: string;
  @Field() summary: string;
  @Field(() => String, { nullable: true }) hookText: string | null;
  @Field() hookType: string;
  @Field(() => String, { nullable: true }) ctaText: string | null;
  @Field(() => String, { nullable: true }) ctaType: string | null;
  @Field(() => [String]) targetAudience: string[];
  @Field(() => [String]) emotionalTriggers: string[];
  @Field(() => [String]) genres: string[];
  @Field() language: string;
  @Field() createdAt: Date;
}

@ObjectType()
export class SourceAdModel {
  @Field(() => ID) id: string;
  @Field(() => SourceAdOrigin) origin: SourceAdOrigin;
  @Field(() => SourceAdStatus) status: SourceAdStatus;
  @Field(() => String, { nullable: true }) title: string | null;
  @Field(() => String, { nullable: true }) adText: string | null;
  @Field(() => String, { nullable: true }) sourceUrl: string | null;
  @Field(() => String, { nullable: true }) externalId: string | null;
  @Field(() => [String]) networks: string[];
  @Field(() => [String]) countries: string[];
  @Field(() => Date, { nullable: true }) firstSeenAt: Date | null;
  @Field(() => Date, { nullable: true }) lastSeenAt: Date | null;
  @Field(() => Float, { nullable: true }) impressionShare: number | null;
  @Field() provider: string;
  @Field() isEstimated: boolean;
  @Field(() => Confidence) confidence: Confidence;
  @Field() createdAt: Date;
  @Field(() => CompetitorModel, { nullable: true }) competitor: CompetitorModel | null;
  @Field(() => CreativeAnalysisModel, { nullable: true }) latestAnalysis: CreativeAnalysisModel | null;
  @Field(() => MediaAssetModel, { nullable: true }) mediaAsset: MediaAssetModel | null;
}

@ObjectType()
export class CreateSourceAdPayload {
  @Field(() => SourceAdModel) sourceAd: SourceAdModel;
  @Field(() => JobModel, { nullable: true }) job: JobModel | null;
}

@ObjectType()
export class ImportResultModel {
  @Field(() => Int) importedCount: number;
  @Field(() => Int) duplicateCount: number;
  @Field(() => [String]) errors: string[];
}

@ObjectType()
export class SimilarSourceAdModel {
  @Field(() => Float) similarity: number;
  @Field(() => SourceAdModel) sourceAd: SourceAdModel;
}

@ObjectType()
export class ReembedSourceAdsPayload {
  @Field(() => Int) enqueued: number;
}
