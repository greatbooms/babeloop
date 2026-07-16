import { Field, InputType } from '@nestjs/graphql';
import { ReferenceCategory } from '../../../generated/prisma';

@InputType()
export class CreateCompetitorInput {
  @Field() name: string;
  @Field(() => ReferenceCategory) category: ReferenceCategory;
  @Field(() => String, { nullable: true }) notes?: string;
}
