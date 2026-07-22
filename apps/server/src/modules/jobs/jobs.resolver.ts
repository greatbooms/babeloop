import { UseGuards } from '@nestjs/common';
import { Args, ID, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
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

  // 잡 결과(briefId 등)를 프론트가 후속 이동에 쓸 수 있게 JSON 문자열로 노출
  @ResolveField(() => String, { nullable: true })
  resultJson(@Parent() job: { result: unknown }) {
    return job.result == null ? null : JSON.stringify(job.result);
  }
}
