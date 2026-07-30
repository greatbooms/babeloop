import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { Job as BullJob } from 'bullmq';
import { PrismaService } from '../common/prisma/prisma.service';
import { AiExecutionLogService, AiExecutionMeta } from '../modules/ai-log/ai-execution-log.service';
import { BACK_TRANSLATE_SYSTEM, buildLocalizePrompt, LOCALIZE_SYSTEM } from '../modules/generation/generation.prompts';
import { backTranslationSchema, GENERATION_PROMPT_VERSIONS, localizationSchema } from '../modules/generation/generation.schemas';
import { JobRecordService } from '../modules/jobs/job-record.service';
import { generateJsonWithRepair } from '../providers/text/generate-json-with-repair';
import { TEXT_GENERATION_PROVIDER, TextGenerationProvider } from '../providers/text/text-generation.provider';
import { JOB_TYPES, LOCALIZATION_QUEUE } from './queue.constants';

@Processor(LOCALIZATION_QUEUE)
export class LocalizationProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiLog: AiExecutionLogService,
    private readonly jobRecord: JobRecordService,
    @Inject(TEXT_GENERATION_PROVIDER) private readonly textAi: TextGenerationProvider,
  ) {
    super();
  }

  async process(job: BullJob<{ creativeId?: string; localizationId?: string }>): Promise<void> {
    if (job.name === JOB_TYPES.BACK_TRANSLATE_KO) return this.backTranslate(job as BullJob<{ localizationId: string }>);
    return this.localize(job as BullJob<{ creativeId: string }>);
  }

  /** 검수자 수정본을 한국어로 역번역해 참고용으로 저장한다 — 한국 작업자가 수정 내용을 읽을 수 있게 */
  private async backTranslate(job: BullJob<{ localizationId: string }>): Promise<void> {
    const jobId = job.id!;
    await this.jobRecord.markRunning(jobId);
    try {
      const localization = await this.prisma.localizationVersion.findUniqueOrThrow({ where: { id: job.data.localizationId } });
      const meta: AiExecutionMeta = {
        provider: this.textAi.name,
        model: this.textAi.model,
        promptVersion: GENERATION_PROMPT_VERSIONS.backTranslate,
        inputRef: `localization:${localization.id}`,
      };
      const result = await this.aiLog.record(meta, async () => {
        const { data, usage } = await generateJsonWithRepair(
          this.textAi,
          { system: BACK_TRANSLATE_SYSTEM, prompt: localization.text, responseHint: 'ko-back-translation' },
          backTranslationSchema,
        );
        Object.assign(meta, usage);
        return data;
      });
      await this.prisma.localizationVersion.update({ where: { id: localization.id }, data: { koBackTranslation: result.ko } });
      await this.jobRecord.markSucceeded(jobId);
    } catch (error) {
      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
        const message = error instanceof Error ? error.message : String(error);
        await this.jobRecord.markFailed(jobId, message);
      }
      throw error;
    }
  }

  private async localize(job: BullJob<{ creativeId: string }>): Promise<void> {
    const jobId = job.id!;
    await this.jobRecord.markRunning(jobId);
    try {
      const creative = await this.prisma.generatedCreative.findUniqueOrThrow({
        where: { id: job.data.creativeId },
      });
      const meta: AiExecutionMeta = {
        provider: this.textAi.name,
        model: this.textAi.model,
        promptVersion: GENERATION_PROMPT_VERSIONS.localizeZhTw,
        inputRef: `creative:${creative.id}`,
      };
      const result = await this.aiLog.record(meta, async () => {
          const { data, usage } = await generateJsonWithRepair(
            this.textAi,
            {
              system: LOCALIZE_SYSTEM,
              prompt: buildLocalizePrompt(creative.koreanText),
              responseHint: 'zh-tw-localization',
            },
            localizationSchema,
          );
          Object.assign(meta, usage);
          return data;
      });
      await this.prisma.localizationVersion.deleteMany({
        where: { creativeId: creative.id, locale: 'zh-TW', kind: 'AI_DRAFT' },
      });
      await this.prisma.localizationVersion.create({
        data: {
          creativeId: creative.id,
          locale: 'zh-TW',
          kind: 'AI_DRAFT',
          text: result.zhTw,
          notes: result.notes ?? null,
          provider: this.textAi.name,
          model: this.textAi.model,
        },
      });
      await this.jobRecord.markSucceeded(jobId);
    } catch (error) {
      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
        const message = error instanceof Error ? error.message : String(error);
        await this.jobRecord.markFailed(jobId, message);
      }
      throw error;
    }
  }
}
