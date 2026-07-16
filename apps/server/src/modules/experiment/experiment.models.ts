import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { CreativeStatus } from '../../../generated/prisma';

@ObjectType()
export class ExperimentCreativeModel {
  @Field(() => ID) id: string;
  @Field() koreanText: string;
  @Field(() => CreativeStatus) status: CreativeStatus;
  @Field(() => Int) revision: number;
  @Field(() => String, { nullable: true }) hookType: string | null;
}

@ObjectType()
export class ExperimentVariantModel {
  @Field(() => ID) id: string;
  @Field(() => ID) experimentId: string;
  @Field(() => ID) creativeId: string;
  @Field() variantCode: string;
  @Field() trackingCode: string;
  @Field() createdAt: Date;
  @Field(() => ExperimentCreativeModel) creative: ExperimentCreativeModel;
}

@ObjectType()
export class ExperimentModel {
  @Field(() => ID) id: string;
  @Field() code: string;
  @Field() name: string;
  @Field() marketCode: string;
  @Field() createdAt: Date;
  @Field(() => [ExperimentVariantModel]) variants: ExperimentVariantModel[];
}

@ObjectType()
export class ExportPackageModel {
  @Field(() => ID) id: string;
  @Field(() => ID) experimentId: string;
  @Field() storagePrefix: string;
  @Field() manifestJson: string;
  @Field(() => ID, { nullable: true }) createdById: string | null;
  @Field() createdAt: Date;
}

@ObjectType()
export class ExportFileModel {
  @Field() trackingCode: string;
  @Field() filename: string;
  @Field() url: string;
}

@ObjectType()
export class ExportResultModel {
  @Field(() => ExportPackageModel) package: ExportPackageModel;
  @Field(() => [ExportFileModel]) files: ExportFileModel[];
  @Field() manifestUrl: string;
}
