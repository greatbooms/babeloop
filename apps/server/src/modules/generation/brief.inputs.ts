import { Field, ID, InputType, Int, registerEnumType } from '@nestjs/graphql';
import { CreativeType } from '../../../generated/prisma';

export enum GenerationReferenceKind {
  GENERATED_IMAGE = 'GENERATED_IMAGE',
  SOURCE_AD = 'SOURCE_AD',
  MEDIA_ASSET = 'MEDIA_ASSET',
}

registerEnumType(GenerationReferenceKind, { name: 'GenerationReferenceKind' });

export enum GenerationReferenceRole {
  CHARACTER = 'CHARACTER',
  STYLE = 'STYLE',
  TYPOGRAPHY = 'TYPOGRAPHY',
}

registerEnumType(GenerationReferenceRole, { name: 'GenerationReferenceRole' });

export enum CopyInfluence {
  SCENE = 'SCENE',
  TEXT_ONLY = 'TEXT_ONLY',
}

registerEnumType(CopyInfluence, { name: 'CopyInfluence' });

@InputType()
export class GenerationReferenceInput {
  @Field(() => GenerationReferenceKind) kind: GenerationReferenceKind;
  @Field(() => ID) id: string;
  @Field(() => GenerationReferenceRole, { defaultValue: GenerationReferenceRole.STYLE })
  role?: GenerationReferenceRole;
}

@InputType()
export class GenerateCreativeBriefInput {
  @Field(() => String, { nullable: true }) title?: string;
  @Field(() => String, { nullable: true }) focusText?: string;
  @Field(() => ID, { nullable: true }) brandId?: string;
  @Field(() => [ID], { nullable: true }) sourceAdIds?: string[];
}

@InputType()
export class GenerateCreativeVariantsInput {
  @Field(() => ID) briefId: string;
  @Field(() => CreativeType) type: CreativeType;
  @Field(() => Int, { nullable: true, defaultValue: 3 }) count: number;
}

@InputType()
export class GenerateCreativeImagesInput {
  @Field(() => ID) creativeId: string;
  @Field(() => CopyInfluence, { nullable: true, defaultValue: CopyInfluence.SCENE })
  copyInfluence?: CopyInfluence;
  @Field(() => String, { nullable: true }) instructions?: string;
  @Field(() => String, { nullable: true }) overlayHeadline?: string;
  @Field(() => String, { nullable: true }) overlaySubline?: string;
  @Field(() => String, { nullable: true, defaultValue: 'SERVER' }) overlayMode?: string;
  @Field(() => String, { nullable: true, defaultValue: 'gothic' }) overlayFont?: string;
  @Field(() => String, { nullable: true, defaultValue: 'white' }) overlayColor?: string;
  @Field(() => String, { nullable: true }) aiTypoStyle?: string;
  @Field(() => Int, { nullable: true, defaultValue: 2 }) count: number;
  @Field(() => String, { nullable: true, defaultValue: 'low' }) quality: string;
  @Field(() => String, { nullable: true, defaultValue: 'square_1200x1200' })
  sizePreset?: string;
  @Field(() => [GenerationReferenceInput], { nullable: true })
  references?: GenerationReferenceInput[];
}

@InputType()
export class GenerateCreativeVideoInput {
  @Field(() => ID) creativeId: string;
  @Field(() => Int, { nullable: true, defaultValue: 12 }) seconds: number;
  @Field(() => String, { nullable: true }) instructions?: string;
  @Field(() => ID, { nullable: true }) referenceImageId?: string;
}

@InputType()
export class GenerateBriefFromPerformanceInput {
  @Field(() => ID) experimentId: string;
}
