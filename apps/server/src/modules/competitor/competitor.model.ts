import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';
import { ReferenceCategory } from '../../../generated/prisma';

registerEnumType(ReferenceCategory, { name: 'ReferenceCategory' });

@ObjectType()
export class CompetitorModel {
  @Field(() => ID) id: string;
  @Field() name: string;
  @Field(() => ReferenceCategory) category: ReferenceCategory;
  @Field(() => String, { nullable: true }) notes: string | null;
  @Field() createdAt: Date;
}
