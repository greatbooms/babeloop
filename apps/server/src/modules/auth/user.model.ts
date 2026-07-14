import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';
import { UserRole } from '../../../generated/prisma';

registerEnumType(UserRole, { name: 'UserRole' });

@ObjectType()
export class UserModel {
  @Field(() => ID) id: string;
  @Field() email: string;
  @Field() displayName: string;
  @Field(() => UserRole) role: UserRole;
}
