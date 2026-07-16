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
