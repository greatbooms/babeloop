import { Field, ID, InputType } from '@nestjs/graphql';

@InputType()
export class BrandFeatureInput {
  @Field() name: string;
  @Field() description: string;
}

@InputType()
export class CreateBrandInput {
  @Field() name: string;
  @Field(() => String, { nullable: true }) serviceUrl?: string;
  @Field(() => String, { nullable: true }) description?: string;
  @Field(() => [BrandFeatureInput], { defaultValue: [] }) features: BrandFeatureInput[];
}

@InputType()
export class UpdateBrandInput {
  @Field(() => ID) id: string;
  @Field(() => String, { nullable: true }) name?: string;
  @Field(() => String, { nullable: true }) serviceUrl?: string;
  @Field(() => String, { nullable: true }) description?: string;
}
