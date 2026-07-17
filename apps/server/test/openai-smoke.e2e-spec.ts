import { OpenAIEmbeddingProvider } from '../src/providers/embedding/openai-embedding.provider';
import { OpenAITextGenerationProvider } from '../src/providers/text/openai-text-generation.provider';

const hasTextKey = Boolean(process.env.TEXT_AI_API_KEY && process.env.TEXT_AI_MODEL);
const hasEmbeddingKey = Boolean(process.env.EMBEDDING_API_KEY);

(hasTextKey ? describe : describe.skip)('openai live smoke', () => {
  jest.setTimeout(30_000);

  it('실제 텍스트 생성이 JSON을 반환하고 usage가 채워진다', async () => {
    const output = await new OpenAITextGenerationProvider().generate({
      system: 'JSON 객체로만 답하라.',
      prompt: '{"ok": true}와 같은 형태로 ok=true를 반환하라.',
    });

    expect(JSON.parse(output.text)).toMatchObject({ ok: true });
    expect(output.inputTokens).toBeGreaterThan(0);
    expect(output.outputTokens).toBeGreaterThan(0);
  });

  (hasEmbeddingKey ? it : it.skip)('실제 임베딩이 1536차원 벡터를 반환한다', async () => {
    const vector = await new OpenAIEmbeddingProvider().embed('BabeLoop OpenAI smoke test');
    expect(vector).toHaveLength(1536);
  });
});
