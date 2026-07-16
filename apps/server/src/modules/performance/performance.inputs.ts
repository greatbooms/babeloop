import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class ImportPerformanceCsvInput {
  @Field() fileBase64: string;
  @Field() filename: string;
}

@InputType()
export class PerformanceExperimentInput {
  @Field() experimentId: string;
}
