import { TextGenerationInput, TextGenerationOutput, TextGenerationProvider } from './text-generation.provider';

export interface OpenAITextClient {
  chat: {
    completions: {
      create(input: {
        model: string;
        messages: Array<{ role: 'system' | 'user'; content: string }>;
        response_format: { type: 'json_object' };
      }): Promise<{
        choices: Array<{ message?: { content?: string | null } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      }>;
    };
  };
}

export class OpenAITextGenerationProvider implements TextGenerationProvider {
  readonly name = 'openai';
  readonly model = process.env.TEXT_AI_MODEL!;
  private readonly client: OpenAITextClient;

  constructor(client?: OpenAITextClient) {
    if (client) {
      this.client = client;
      return;
    }
    // SDK 로드는 실제 OpenAI provider를 선택할 때만 수행해 mock 기본 경로를 격리한다.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const OpenAI = require('openai').default;
    this.client = new OpenAI({ apiKey: process.env.TEXT_AI_API_KEY });
  }

  async generate(input: TextGenerationInput): Promise<TextGenerationOutput> {
    // responseHint는 프롬프트가 이미 JSON 스키마를 지시하므로 OpenAI 호출에는 사용하지 않는다.
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.prompt },
      ],
      response_format: { type: 'json_object' },
    });
    const inputTokens = response.usage?.prompt_tokens;
    const outputTokens = response.usage?.completion_tokens;
    return {
      text: response.choices[0]?.message?.content ?? '',
      inputTokens,
      outputTokens,
      costEstimateUsd: this.cost(inputTokens, outputTokens),
    };
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
