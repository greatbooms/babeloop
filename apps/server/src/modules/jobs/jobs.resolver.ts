import { UseGuards } from '@nestjs/common';
import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { JobModel } from './job.model';
import { JobRecordService } from './job-record.service';

@Resolver(() => JobModel)
@UseGuards(GqlAuthGuard)
export class JobsResolver {
  constructor(private readonly jobRecord: JobRecordService) {}

  @Query(() => JobModel, { nullable: true })
  job(@Args('id', { type: () => ID }) id: string) {
    return this.jobRecord.findById(id);
  }
}
