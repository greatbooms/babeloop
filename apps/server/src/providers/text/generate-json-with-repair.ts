import { z } from 'zod';
import { TextGenerationInput, TextGenerationProvider } from './text-generation.provider';

/** AI JSON 응답을 Zod로 검증하고, 실패 시 오류를 포함해 1회 repair 재요청한다 (설계 §11). */
export async function generateJsonWithRepair<T extends z.ZodTypeAny>(
  provider: TextGenerationProvider,
  input: TextGenerationInput,
  schema: T,
): Promise<z.infer<T>> {
  const attempt = (raw: string): z.infer<T> | { error: string } => {
    try {
      const parsed = JSON.parse(raw);
      const result = schema.safeParse(parsed);
      if (result.success) return result.data;
      return { error: result.error.toString() };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  };

  const first = attempt(await provider.generate(input));
  if (!(typeof first === 'object' && first !== null && 'error' in first)) return first;

  const repairPrompt = `${input.prompt}\n\n이전 응답이 유효한 JSON 스키마 검증에 실패했다: ${first.error}\n스키마에 맞는 JSON만 출력하라.`;
  const second = attempt(await provider.generate({ system: input.system, prompt: repairPrompt }));
  if (!(typeof second === 'object' && second !== null && 'error' in second)) return second;

  throw new Error(`AI JSON 응답 검증 실패 (repair 재시도 후): ${second.error}`);
}
