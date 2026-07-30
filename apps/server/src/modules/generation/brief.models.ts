import { Field, Float, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { BrandModel } from '../brand/brand.models';
import { BriefReferenceMethod, CreativeStatus, CreativeType, LocalizationKind } from '../../../generated/prisma';
import { JobModel } from '../jobs/job.model';

registerEnumType(CreativeType, { name: 'CreativeType' });
registerEnumType(CreativeStatus, { name: 'CreativeStatus' });
registerEnumType(LocalizationKind, { name: 'LocalizationKind' });
registerEnumType(BriefReferenceMethod, { name: 'BriefReferenceMethod' });

@ObjectType()
export class BriefReferenceModel {
  @Field(() => ID, { nullable: true }) sourceAdId: string | null;
  @Field(() => String, { nullable: true }) title: string | null;
  @Field(() => BriefReferenceMethod) method: BriefReferenceMethod;
  @Field(() => Float, { nullable: true }) similarity: number | null;
  @Field() deleted: boolean;
}

@ObjectType()
export class AdRefModel {
  @Field(() => ID) id: string;
  @Field(() => String, { nullable: true }) title: string | null;
}

@ObjectType()
export class LocalizationVersionModel {
  @Field(() => ID) id: string;
  @Field() locale: string;
  @Field(() => LocalizationKind) kind: LocalizationKind;
  @Field() text: string;
  @Field(() => String, { nullable: true }) notes: string | null;
  @Field(() => String, { nullable: true }) koBackTranslation: string | null;
  @Field() createdAt: Date;
}

@ObjectType()
export class GeneratedCreativeModel {
  @Field(() => ID) id: string;
  @Field(() => ID) briefId: string;
  @Field(() => CreativeType) type: CreativeType;
  @Field(() => CreativeStatus) status: CreativeStatus;
  @Field(() => Int) variantIndex: number;
  @Field(() => String, { nullable: true }) hookType: string | null;
  @Field() koreanText: string;
  @Field(() => String, { nullable: true }) scenesJson: string | null;
  @Field() provider: string;
  @Field() model: string;
  @Field() promptVersion: string;
  @Field() createdAt: Date;
  @Field() updatedAt: Date;
  @Field(() => [LocalizationVersionModel]) localizations: LocalizationVersionModel[];
}

@ObjectType()
export class CreativeBriefModel {
  @Field(() => ID) id: string;
  @Field() title: string;
  @Field() marketCode: string;
  @Field() locale: string;
  @Field() audienceHypothesis: string;
  @Field() desire: string;
  @Field() hookType: string;
  @Field() messageAngle: string;
  @Field() visualFormat: string;
  @Field() callToAction: string;
  @Field() rationale: string;
  @Field(() => String, { nullable: true }) focusText: string | null;
  @Field(() => [ID]) sourceAdIds: string[];
  @Field(() => [BriefReferenceModel]) references: BriefReferenceModel[];
  @Field(() => ID, { nullable: true }) brandId: string | null;
  @Field(() => BrandModel, { nullable: true }) brand: BrandModel | null;
  @Field() provider: string;
  @Field() model: string;
  @Field() promptVersion: string;
  @Field() rawJson: string;
  @Field(() => String, { nullable: true }) zhTwJson: string | null;
  @Field(() => ID, { nullable: true }) createdById: string | null;
  @Field() createdAt: Date;
  @Field(() => [GeneratedCreativeModel]) creatives: GeneratedCreativeModel[];
}

@ObjectType()
export class GenerateJobPayload {
  @Field(() => JobModel) job: JobModel;
}
