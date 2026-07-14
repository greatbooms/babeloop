import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class BrandFeatureModel {
  @Field(() => ID) id: string;
  @Field() name: string;
  @Field() description: string;
}

@ObjectType()
export class BrandGuidelineModel {
  @Field(() => ID) id: string;
  @Field() title: string;
  @Field() content: string;
}

@ObjectType()
export class BrandModel {
  @Field(() => ID) id: string;
  @Field() name: string;
  @Field(() => String, { nullable: true }) serviceUrl: string | null;
  @Field(() => String, { nullable: true }) description: string | null;
  @Field(() => [BrandFeatureModel]) features: BrandFeatureModel[];
  @Field(() => [BrandGuidelineModel]) guidelines: BrandGuidelineModel[];
}
