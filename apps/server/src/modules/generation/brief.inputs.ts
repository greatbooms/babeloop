import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { CreativeType } from '../../../generated/prisma';

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
export class GenerateBriefImagesInput {
  @Field(() => ID) briefId: string;
  @Field(() => String, { nullable: true }) instructions?: string;
  @Field(() => Int, { nullable: true, defaultValue: 2 }) count: number;
  @Field(() => String, { nullable: true, defaultValue: 'low' }) quality: string;
}

@InputType()
export class GenerateCreativeImagesInput {
  @Field(() => ID) creativeId: string;
  @Field(() => String, { nullable: true }) instructions?: string;
  @Field(() => Int, { nullable: true, defaultValue: 2 }) count: number;
  @Field(() => String, { nullable: true, defaultValue: 'low' }) quality: string;
}

@InputType()
export class GenerateCreativeVideoInput {
  @Field(() => ID) creativeId: string;
  @Field(() => Int, { nullable: true, defaultValue: 12 }) seconds: number;
  @Field(() => String, { nullable: true }) instructions?: string;
}

@InputType()
export class GenerateBriefFromPerformanceInput {
  @Field(() => ID) experimentId: string;
}
