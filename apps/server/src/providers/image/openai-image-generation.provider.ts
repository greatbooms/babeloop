import { toFile } from 'openai';

import {
  ImageGenerationInput,
  ImageGenerationOutput,
  ImageGenerationProvider,
  ImageGenerationSize,
} from './image-generation.provider';

export interface ImagesApiResponse {
  data?: Array<{ b64_json?: string | null }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { text_tokens?: number; image_tokens?: number };
  };
}

export interface OpenAIImageGenerationClient {
  images: {
    generate(input: {
      model: string;
      prompt: string;
      n: number;
      quality: 'low' | 'high';
      size: ImageGenerationSize;
    }): Promise<ImagesApiResponse>;
    edit(input: {
      model: string;
      image: Awaited<ReturnType<typeof toFile>>[];
      prompt: string;
      n: number;
      quality: 'low' | 'high';
      size: ImageGenerationSize;
      input_fidelity: 'high';
    }): Promise<ImagesApiResponse>;
  };
}

export class OpenAIImageGenerationProvider implements ImageGenerationProvider {
  readonly name = 'openai';
  readonly model = process.env.IMAGE_MODEL ?? 'gpt-image-1';
  private readonly client: OpenAIImageGenerationClient;

  constructor(client?: OpenAIImageGenerationClient) {
    if (client) {
      this.client = client;
      return;
    }
    // SDK 로드는 실제 OpenAI provider를 선택할 때만 수행해 mock 기본 경로를 격리한다.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const OpenAI = require('openai').default;
    this.client = new OpenAI({
      apiKey: process.env.IMAGE_API_KEY ?? process.env.TEXT_AI_API_KEY,
    }) as OpenAIImageGenerationClient;
  }

  async generate(input: ImageGenerationInput): Promise<ImageGenerationOutput> {
    const size = input.size ?? '1024x1024';
    const response = input.referenceImages?.length
      ? await this.client.images.edit({
          model: this.model,
          image: await Promise.all(
            input.referenceImages.map((reference, index) =>
              toFile(reference.buffer, `ref-${index + 1}.png`, { type: reference.contentType }),
            ),
          ),
          prompt: input.prompt,
          n: input.count,
          quality: input.quality,
          size,
          input_fidelity: 'high',
        })
      : await this.client.images.generate({
          model: this.model,
          prompt: input.prompt,
          n: input.count,
          quality: input.quality,
          size,
        });
    const images = (response.data ?? []).map((image, index) => {
      if (!image.b64_json) {
        throw new Error(`이미지 생성 응답 ${index + 1}에 b64_json이 없습니다`);
      }
      return {
        buffer: Buffer.from(image.b64_json, 'base64'),
        contentType: 'image/png',
      };
    });
    // 응답 usage(실사용 토큰)가 있으면 공시 단가로 실비를 계산한다 — 없을 때만 장당 추정 폴백
    const usage = response.usage;
    const actualCost = usage
      ? ((usage.input_tokens_details?.text_tokens ?? 0) * this.pricePerMillion('IMAGE_PRICE_TEXT_IN_PER_M', 5) +
          (usage.input_tokens_details?.image_tokens ?? 0) * this.pricePerMillion('IMAGE_PRICE_IMAGE_IN_PER_M', 10) +
          (usage.output_tokens ?? 0) * this.pricePerMillion('IMAGE_PRICE_OUT_PER_M', 40)) /
        1_000_000
      : undefined;
    return {
      images,
      costEstimateUsd: actualCost ?? images.length * this.priceFor(input.quality, size),
      inputTokens: usage?.input_tokens,
      outputTokens: usage?.output_tokens,
    };
  }

  private pricePerMillion(name: string, fallback: number): number {
    const value = Number(process.env[name] ?? fallback);
    return Number.isFinite(value) ? value : fallback;
  }

  private priceFor(quality: 'low' | 'high', size: ImageGenerationSize): number {
    const name = quality === 'low' ? 'IMAGE_PRICE_LOW_USD' : 'IMAGE_PRICE_HIGH_USD';
    const fallback = quality === 'low' ? 0.04 : 0.19;
    const value = Number(process.env[name] ?? fallback);
    const squarePrice = Number.isFinite(value) ? value : fallback;
    return squarePrice * (size === '1024x1024' ? 1 : 1.5);
  }
}
