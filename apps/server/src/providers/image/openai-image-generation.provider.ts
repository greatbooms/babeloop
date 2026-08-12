import { toFile } from 'openai';

import {
  ImageGenerationInput,
  ImageGenerationOutput,
  ImageGenerationProvider,
} from './image-generation.provider';

export interface OpenAIImageGenerationClient {
  images: {
    generate(input: {
      model: string;
      prompt: string;
      n: number;
      quality: 'low' | 'high';
      size: '1024x1024';
    }): Promise<{ data?: Array<{ b64_json?: string | null }> }>;
    edit(input: {
      model: string;
      image: Awaited<ReturnType<typeof toFile>>[];
      prompt: string;
      n: number;
      quality: 'low' | 'high';
      size: '1024x1024';
      input_fidelity: 'high';
    }): Promise<{ data?: Array<{ b64_json?: string | null }> }>;
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
          size: '1024x1024',
          input_fidelity: 'high',
        })
      : await this.client.images.generate({
          model: this.model,
          prompt: input.prompt,
          n: input.count,
          quality: input.quality,
          size: '1024x1024',
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
    return {
      images,
      costEstimateUsd: images.length * this.priceFor(input.quality),
    };
  }

  private priceFor(quality: 'low' | 'high'): number {
    const name = quality === 'low' ? 'IMAGE_PRICE_LOW_USD' : 'IMAGE_PRICE_HIGH_USD';
    const fallback = quality === 'low' ? 0.04 : 0.19;
    const value = Number(process.env[name] ?? fallback);
    return Number.isFinite(value) ? value : fallback;
  }
}
