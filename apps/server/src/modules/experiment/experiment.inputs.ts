import { Field, ID, InputType } from '@nestjs/graphql';

@InputType()
export class CreateExperimentInput {
  @Field() code: string;
  @Field() name: string;
}

@InputType()
export class AddCreativeToExperimentInput {
  @Field(() => ID) experimentId: string;
  @Field(() => ID) creativeId: string;
}

@InputType()
export class ExportExperimentInput {
  @Field(() => ID) experimentId: string;
}
