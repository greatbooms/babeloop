import { Field, Float, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import {
  CreativeStatus,
  CreativeType,
  PolicyCheckStatus,
  PolicyCheckType,
  ReviewEventKind,
} from '../../../generated/prisma';
import { GeneratedImageModel, LocalizationVersionModel } from '../generation/brief.models';

registerEnumType(PolicyCheckType, { name: 'PolicyCheckType' });
registerEnumType(PolicyCheckStatus, { name: 'PolicyCheckStatus' });
registerEnumType(ReviewEventKind, { name: 'ReviewEventKind' });

@ObjectType()
export class PolicyCheckModel {
  @Field(() => ID) id: string;
  @Field(() => PolicyCheckType) checkType: PolicyCheckType;
  @Field(() => PolicyCheckStatus) status: PolicyCheckStatus;
  @Field() detailJson: string;
  @Field() createdAt: Date;
}

@ObjectType()
export class ReviewEventModel {
  @Field(() => ID) id: string;
  @Field(() => ReviewEventKind) kind: ReviewEventKind;
  @Field(() => ID) actorId: string;
  @Field(() => String, { nullable: true }) note: string | null;
  @Field() createdAt: Date;
}

@ObjectType()
export class CreativeExperimentVariantModel {
  @Field(() => ID) id: string;
  @Field() variantCode: string;
  @Field() trackingCode: string;
  @Field(() => Date, { nullable: true }) exportedAt: Date | null;
}

@ObjectType()
export class GeneratedVideoModel {
  @Field(() => ID) id: string;
  @Field() url: string;
  @Field(() => Int) seconds: number;
  @Field() size: string;
  @Field(() => Float, { nullable: true }) costEstimateUsd: number | null;
  @Field() createdAt: Date;
}

@ObjectType()
export class CreativeDetailModel {
  @Field(() => ID) id: string;
  @Field(() => ID) briefId: string;
  @Field() briefTitle: string;
  @Field() locale: string;
  @Field(() => CreativeType) type: CreativeType;
  @Field(() => CreativeStatus) status: CreativeStatus;
  @Field(() => Int) variantIndex: number;
  @Field(() => Int) revision: number;
  @Field(() => String, { nullable: true }) hookType: string | null;
  @Field() koreanText: string;
  @Field(() => String, { nullable: true }) scenesJson: string | null;
  @Field() provider: string;
  @Field() model: string;
  @Field() promptVersion: string;
  @Field(() => ID, { nullable: true }) createdById: string | null;
  @Field(() => ID, { nullable: true }) lastEditedById: string | null;
  @Field() minorFlagged: boolean;
  @Field(() => String, { nullable: true }) minorFlagNote: string | null;
  @Field() createdAt: Date;
  @Field() updatedAt: Date;
  @Field(() => [LocalizationVersionModel]) localizations: LocalizationVersionModel[];
  @Field(() => [GeneratedImageModel]) images: GeneratedImageModel[];
  @Field(() => [GeneratedVideoModel]) videos: GeneratedVideoModel[];
  @Field(() => [PolicyCheckModel]) policyChecks: PolicyCheckModel[];
  @Field(() => [ReviewEventModel]) reviewEvents: ReviewEventModel[];
  @Field(() => [CreativeExperimentVariantModel])
  experimentVariants: CreativeExperimentVariantModel[];
}
