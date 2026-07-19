import { OcrInput, OcrOutput, OcrProvider } from './ocr.provider';

const OCR_SYSTEM = `이미지에 보이는 모든 텍스트를 추출하라. 광고 이미지라면 훅 문구·자막·버튼 텍스트를 빠짐없이 포함하라.
반드시 아래 JSON 구조로만 응답하라:
{"text": "추출한 전체 텍스트 (줄바꿈 유지)"}`;

export interface OpenAIOcrClient {
  chat: {
    completions: {
      create(input: {
        model: string;
        messages: Array<
          | { role: 'system'; content: string }
          | { role: 'user'; content: Array<{ type: 'image_url'; image_url: { url: string } }> }
        >;
        response_format: { type: 'json_object' };
      }): Promise<{
        choices: Array<{ message?: { content?: string | null } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      }>;
    };
  };
}

export class OpenAIOcrProvider implements OcrProvider {
  readonly name = 'openai';
  readonly model = process.env.OCR_MODEL ?? process.env.TEXT_AI_MODEL!;
  private readonly client: OpenAIOcrClient;

  constructor(client?: OpenAIOcrClient) {
    if (client) {
      this.client = client;
      return;
    }
    // SDK 로드는 실제 OpenAI provider를 선택할 때만 수행해 mock 기본 경로를 격리한다.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const OpenAI = require('openai').default;
    this.client = new OpenAI({ apiKey: process.env.TEXT_AI_API_KEY });
  }

  async extractText(input: OcrInput): Promise<OcrOutput> {
    const dataUrl = `data:${input.contentType};base64,${input.buffer.toString('base64')}`;
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: OCR_SYSTEM },
        { role: 'user', content: [{ type: 'image_url', image_url: { url: dataUrl } }] },
      ],
      response_format: { type: 'json_object' },
    });
    const content = response.choices[0]?.message?.content ?? '';
    const inputTokens = response.usage?.prompt_tokens;
    const outputTokens = response.usage?.completion_tokens;
    return {
      text: this.parseText(content),
      inputTokens,
      outputTokens,
      costEstimateUsd: this.cost(inputTokens, outputTokens),
    };
  }

  private parseText(content: string): string {
    try {
      const parsed: unknown = JSON.parse(content);
      if (typeof parsed === 'object' && parsed !== null && typeof (parsed as { text?: unknown }).text === 'string') {
        return (parsed as { text: string }).text;
      }
    } catch {
      // OCR 결과는 JSON 형식 위반이어도 유용하므로 원문을 보존한다.
    }
    return content;
  }

  private cost(inputTokens?: number, outputTokens?: number): number | undefined {
    const inputPrice = this.price('TEXT_AI_USD_PER_MTOK_INPUT');
    const outputPrice = this.price('TEXT_AI_USD_PER_MTOK_OUTPUT');
    if (inputPrice === undefined || outputPrice === undefined) return undefined;
    return ((inputTokens ?? 0) * inputPrice + (outputTokens ?? 0) * outputPrice) / 1_000_000;
  }

  private price(name: 'TEXT_AI_USD_PER_MTOK_INPUT' | 'TEXT_AI_USD_PER_MTOK_OUTPUT'): number | undefined {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  }
}
