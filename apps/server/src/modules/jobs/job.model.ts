import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';
import { JobStatus } from '../../../generated/prisma';

registerEnumType(JobStatus, { name: 'JobStatus' });

@ObjectType()
export class JobModel {
  @Field(() => ID) id: string;
  @Field() queue: string;
  @Field() type: string;
  @Field(() => JobStatus) status: JobStatus;
  @Field(() => String, { nullable: true }) error: string | null;
  @Field() createdAt: Date;
  @Field(() => Date, { nullable: true }) startedAt: Date | null;
  @Field(() => Date, { nullable: true }) finishedAt: Date | null;
}
