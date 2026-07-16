import { Field, ID, InputType } from '@nestjs/graphql';

@InputType()
export class CreativeIdInput {
  @Field(() => ID) creativeId: string;
}

@InputType()
export class ReviseLocalizationInput {
  @Field(() => ID) creativeId: string;
  @Field() text: string;
  @Field(() => String, { nullable: true }) note?: string;
}

@InputType()
export class CreativeNoteInput {
  @Field(() => ID) creativeId: string;
  @Field(() => String, { nullable: true }) note?: string;
}

@InputType()
export class CreativeReasonInput {
  @Field(() => ID) creativeId: string;
  @Field() reason: string;
}

@InputType()
export class UpdateCreativeTextInput {
  @Field(() => ID) creativeId: string;
  @Field() koreanText: string;
}
