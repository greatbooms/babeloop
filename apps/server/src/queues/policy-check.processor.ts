import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job as BullJob } from 'bullmq';
import { PrismaService } from '../common/prisma/prisma.service';
import { JobRecordService } from '../modules/jobs/job-record.service';
import { PolicyCheckService } from '../modules/policy/policy-check.service';
import { assertTransition } from '../modules/review/creative-state-machine';
import { POLICY_CHECK_QUEUE } from './queue.constants';

interface PolicyCheckJobData {
  creativeId: string;
  requestedById: string;
}

@Processor(POLICY_CHECK_QUEUE)
export class PolicyCheckProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policyCheck: PolicyCheckService,
    private readonly jobRecord: JobRecordService,
  ) {
    super();
  }

  async process(job: BullJob<PolicyCheckJobData>): Promise<void> {
    const jobId = job.id!;
    await this.jobRecord.markRunning(jobId);
    try {
      const result = await this.policyCheck.runAll(job.data.creativeId);
      const creative = await this.prisma.generatedCreative.findUniqueOrThrow({
        where: { id: job.data.creativeId },
        include: { brief: true },
      });
      assertTransition(
        {
          creative: {
            status: creative.status,
            createdById: creative.createdById,
            lastEditedById: creative.lastEditedById,
            minorFlagged: creative.minorFlagged,
            locale: creative.brief.locale,
          },
          actor: { id: job.data.requestedById, role: 'ADMIN' },
        },
        'POLICY_CHECKED',
      );
      await this.prisma.generatedCreative.update({
        where: { id: creative.id },
        data: { status: 'POLICY_CHECKED' },
      });
      await this.prisma.reviewRequest.create({
        data: {
          creativeId: creative.id,
          kind: 'POLICY_CHECKED',
          actorId: job.data.requestedById,
        },
      });
      await this.jobRecord.markSucceeded(jobId, result);
    } catch (error) {
      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
        const message = error instanceof Error ? error.message : String(error);
        await this.jobRecord.markFailed(jobId, message);
      }
      throw error;
    }
  }
}
