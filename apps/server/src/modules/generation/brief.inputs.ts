import { Field, Float, ID, InputType, Int, registerEnumType } from '@nestjs/graphql';
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

export type NormalizedGenerationReference = {
  key: string;
  roles: GenerationReferenceRole[];
};

export type GenerationReferencePayload = NormalizedGenerationReference | {
  key: string;
  role: GenerationReferenceRole;
};

const REFERENCE_ROLE_ORDER: Record<GenerationReferenceRole, number> = {
  [GenerationReferenceRole.CHARACTER]: 0,
  [GenerationReferenceRole.STYLE]: 1,
  [GenerationReferenceRole.TYPOGRAPHY]: 2,
};

export function normalizeReferenceRoles(reference: {
  roles?: GenerationReferenceRole[];
  role?: GenerationReferenceRole;
}): GenerationReferenceRole[] {
  return Array.from(new Set(reference.roles ?? [reference.role ?? GenerationReferenceRole.STYLE]))
    .sort((left, right) => REFERENCE_ROLE_ORDER[left] - REFERENCE_ROLE_ORDER[right]);
}

export function normalizeGenerationReferences(
  references: GenerationReferencePayload[],
): NormalizedGenerationReference[] {
  return references
    .map((reference) => ({ key: reference.key, roles: normalizeReferenceRoles(reference) }))
    .sort((left, right) => REFERENCE_ROLE_ORDER[left.roles[0]] - REFERENCE_ROLE_ORDER[right.roles[0]]);
}

export enum CopyInfluence {
  SCENE = 'SCENE',
  TEXT_ONLY = 'TEXT_ONLY',
}

registerEnumType(CopyInfluence, { name: 'CopyInfluence' });

export enum CharacterCompositePosition {
  LEFT = 'LEFT',
  CENTER = 'CENTER',
  RIGHT = 'RIGHT',
}

registerEnumType(CharacterCompositePosition, { name: 'CharacterCompositePosition' });

@InputType()
export class CharacterCompositeInput {
  @Field(() => Int, { nullable: true }) referenceIndex?: number;
  @Field(() => CharacterCompositePosition, { nullable: true, defaultValue: CharacterCompositePosition.RIGHT })
  position?: CharacterCompositePosition;
  @Field(() => Float, { nullable: true, defaultValue: 0.9 }) heightRatio?: number;
}

@InputType()
export class GenerationReferenceInput {
  @Field(() => GenerationReferenceKind) kind: GenerationReferenceKind;
  @Field(() => ID) id: string;
  @Field(() => GenerationReferenceRole, { defaultValue: GenerationReferenceRole.STYLE })
  role?: GenerationReferenceRole;
  @Field(() => [GenerationReferenceRole], { nullable: true })
  roles?: GenerationReferenceRole[];
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
  @Field(() => CharacterCompositeInput, { nullable: true })
  characterComposite?: CharacterCompositeInput;
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
