import {
  VideoGenerationInput,
  VideoGenerationOutput,
  VideoGenerationProvider,
} from './video-generation.provider';

interface OpenAIVideoJob {
  id?: string;
  status?: 'queued' | 'in_progress' | 'completed' | 'failed';
  error?: { message?: string } | null;
}

const OPENAI_VIDEO_BASE_URL = 'https://api.openai.com/v1';
const POLL_INTERVAL_MS = 2_500;
const GENERATION_TIMEOUT_MS = 10 * 60 * 1_000;

export class OpenAIVideoGenerationProvider implements VideoGenerationProvider {
  readonly name = 'openai';
  readonly model = process.env.VIDEO_MODEL ?? 'sora-2';

  async generate(input: VideoGenerationInput): Promise<VideoGenerationOutput> {
    const apiKey = process.env.VIDEO_API_KEY ?? process.env.TEXT_AI_API_KEY;
    if (!apiKey) {
      throw new Error('VIDEO_API_KEY 또는 TEXT_AI_API_KEY가 필요합니다');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    try {
      const created = await this.requestJson<OpenAIVideoJob>(
        `${OPENAI_VIDEO_BASE_URL}/videos`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: this.model,
            prompt: input.prompt,
            seconds: String(input.seconds),
            size: input.size ?? '720x1280',
          }),
          signal: controller.signal,
        },
      );
      if (!created.id) throw new Error('영상 생성 응답에 id가 없습니다');

      await this.waitUntilCompleted(created.id, headers, controller.signal);
      const response = await fetch(`${OPENAI_VIDEO_BASE_URL}/videos/${created.id}/content`, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      if (!response.ok) await this.throwHttpError(response);

      return {
        video: {
          buffer: Buffer.from(await response.arrayBuffer()),
          contentType: response.headers.get('content-type') ?? 'video/mp4',
        },
        costEstimateUsd: input.seconds * this.pricePerSecond(),
      };
    } catch (error) {
      if (controller.signal.aborted) throw new Error('영상 생성 시간이 10분을 초과했습니다');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async waitUntilCompleted(
    id: string,
    headers: Record<string, string>,
    signal: AbortSignal,
  ): Promise<void> {
    while (!signal.aborted) {
      const job = await this.requestJson<OpenAIVideoJob>(
        `${OPENAI_VIDEO_BASE_URL}/videos/${id}`,
        { method: 'GET', headers, signal },
      );
      if (job.status === 'completed') return;
      if (job.status === 'failed') {
        throw new Error(job.error?.message ?? '영상 생성에 실패했습니다');
      }
      await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    throw new Error('영상 생성 시간이 10분을 초과했습니다');
  }

  private async requestJson<T>(url: string, init: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    if (!response.ok) await this.throwHttpError(response);
    return (await response.json()) as T;
  }

  private async throwHttpError(response: Response): Promise<never> {
    const detail = await response.text();
    throw new Error(`OpenAI 영상 API 요청 실패 (${response.status}): ${detail}`);
  }

  private pricePerSecond(): number {
    const fallback = 0.1;
    const value = Number(process.env.VIDEO_PRICE_PER_SECOND_USD ?? fallback);
    return Number.isFinite(value) ? value : fallback;
  }
}
