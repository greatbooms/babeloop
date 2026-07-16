import { z } from 'zod';
import { generateJsonWithRepair } from './generate-json-with-repair';
import { TextGenerationProvider } from './text-generation.provider';

const schema = z.object({ ok: z.boolean() });

function fakeProvider(outputs: string[]): TextGenerationProvider {
  let i = 0;
  return {
    name: 'fake',
    model: 'fake-1',
    generate: async () => outputs[Math.min(i++, outputs.length - 1)],
  };
}

describe('generateJsonWithRepair', () => {
  it('유효한 JSON은 한 번에 통과한다', async () => {
    const result = await generateJsonWithRepair(fakeProvider(['{"ok":true}']), { system: 's', prompt: 'p' }, schema);
    expect(result).toEqual({ ok: true });
  });

  it('첫 응답이 깨지면 오류를 포함해 1회 재요청한다', async () => {
    const provider = fakeProvider(['not-json', '{"ok":false}']);
    const result = await generateJsonWithRepair(provider, { system: 's', prompt: 'p' }, schema);
    expect(result).toEqual({ ok: false });
  });

  it('재요청도 실패하면 던진다', async () => {
    await expect(
      generateJsonWithRepair(fakeProvider(['bad', 'still-bad']), { system: 's', prompt: 'p' }, schema),
    ).rejects.toThrow('AI JSON 응답 검증 실패');
  });
});
