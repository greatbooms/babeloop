import { z } from 'zod';
import { TextGenerationInput, TextGenerationProvider } from './text-generation.provider';

export interface TextGenerationUsage {
  inputTokens?: number;
  outputTokens?: number;
  costEstimateUsd?: number;
}

/** AI JSON 응답을 Zod로 검증하고, 실패 시 오류를 포함해 1회 repair 재요청한다 (설계 §11). */
export async function generateJsonWithRepair<T extends z.ZodTypeAny>(
  provider: TextGenerationProvider,
  input: TextGenerationInput,
  schema: T,
): Promise<{ data: z.infer<T>; usage: TextGenerationUsage }> {
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

  const firstOutput = await provider.generate(input);
  const first = attempt(firstOutput.text);
  const firstUsage = usageOf(firstOutput);
  if (!(typeof first === 'object' && first !== null && 'error' in first)) return { data: first, usage: firstUsage };

  const repairPrompt = `${input.prompt}\n\n이전 응답이 유효한 JSON 스키마 검증에 실패했다: ${first.error}\n스키마에 맞는 JSON만 출력하라.`;
  const secondOutput = await provider.generate({ ...input, prompt: repairPrompt });
  const second = attempt(secondOutput.text);
  if (!(typeof second === 'object' && second !== null && 'error' in second)) {
    return { data: second, usage: addUsage(firstUsage, usageOf(secondOutput)) };
  }

  throw new Error(`AI JSON 응답 검증 실패 (repair 재시도 후): ${second.error}`);
}

function usageOf(output: Awaited<ReturnType<TextGenerationProvider['generate']>>): TextGenerationUsage {
  const usage: TextGenerationUsage = {};
  if (output.inputTokens !== undefined) usage.inputTokens = output.inputTokens;
  if (output.outputTokens !== undefined) usage.outputTokens = output.outputTokens;
  if (output.costEstimateUsd !== undefined) usage.costEstimateUsd = output.costEstimateUsd;
  return usage;
}

function addUsage(left: TextGenerationUsage, right: TextGenerationUsage): TextGenerationUsage {
  const result: TextGenerationUsage = {};
  if (left.inputTokens !== undefined || right.inputTokens !== undefined) result.inputTokens = (left.inputTokens ?? 0) + (right.inputTokens ?? 0);
  if (left.outputTokens !== undefined || right.outputTokens !== undefined) result.outputTokens = (left.outputTokens ?? 0) + (right.outputTokens ?? 0);
  if (left.costEstimateUsd !== undefined || right.costEstimateUsd !== undefined) result.costEstimateUsd = (left.costEstimateUsd ?? 0) + (right.costEstimateUsd ?? 0);
  return result;
}
