import { z } from 'zod';
import { generateJsonWithRepair } from './generate-json-with-repair';
import { TextGenerationInput, TextGenerationProvider } from './text-generation.provider';

const schema = z.object({ ok: z.boolean() });

function fakeProvider(outputs: Array<{ text: string; inputTokens?: number; outputTokens?: number; costEstimateUsd?: number }>): TextGenerationProvider {
  let i = 0;
  return {
    name: 'fake',
    model: 'fake-1',
    generate: async () => outputs[Math.min(i++, outputs.length - 1)],
  };
}

describe('generateJsonWithRepair', () => {
  it('유효한 JSON은 한 번에 통과한다', async () => {
    const result = await generateJsonWithRepair(fakeProvider([{ text: '{"ok":true}', inputTokens: 3 }]), { system: 's', prompt: 'p' }, schema);
    expect(result).toEqual({ data: { ok: true }, usage: { inputTokens: 3 } });
  });

  it('첫 응답이 깨지면 오류를 포함해 1회 재요청한다', async () => {
    const provider = fakeProvider([{ text: 'not-json' }, { text: '{"ok":false}' }]);
    const result = await generateJsonWithRepair(provider, { system: 's', prompt: 'p' }, schema);
    expect(result.data).toEqual({ ok: false });
  });

  it('재요청도 실패하면 던진다', async () => {
    await expect(
      generateJsonWithRepair(fakeProvider([{ text: 'bad' }, { text: 'still-bad' }]), { system: 's', prompt: 'p' }, schema),
    ).rejects.toThrow('AI JSON 응답 검증 실패');
  });

  it('repair 재요청에도 responseHint를 유지한다', async () => {
    const inputs: TextGenerationInput[] = [];
    const provider: TextGenerationProvider = {
      name: 'fake',
      model: 'fake-1',
      generate: async (input) => {
        inputs.push(input);
        return { text: inputs.length === 1 ? 'bad' : '{"ok":true}' };
      },
    };

    await generateJsonWithRepair(
      provider,
      { system: 's', prompt: 'p', responseHint: 'creative-brief' },
      schema,
    );

    expect(inputs[1].responseHint).toBe('creative-brief');
  });

  it('repair 재시도까지의 usage를 합산한다', async () => {
    const result = await generateJsonWithRepair(
      fakeProvider([
        { text: 'bad', inputTokens: 10, outputTokens: 2, costEstimateUsd: 0.01 },
        { text: '{"ok":true}', inputTokens: 20, outputTokens: 3, costEstimateUsd: 0.02 },
      ]),
      { system: 's', prompt: 'p' },
      schema,
    );

    expect(result.usage).toEqual({ inputTokens: 30, outputTokens: 5, costEstimateUsd: 0.03 });
  });
});
