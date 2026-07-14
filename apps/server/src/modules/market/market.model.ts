import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class MarketModel {
  @Field(() => ID) id: string;
  @Field() code: string;
  @Field() name: string;
  @Field() defaultLocale: string;
  @Field(() => [String]) locales: string[];
}
