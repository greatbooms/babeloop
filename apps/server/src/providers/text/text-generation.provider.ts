export interface TextGenerationInput {
  system: string;
  prompt: string;
}

export interface TextGenerationProvider {
  readonly name: string;
  readonly model: string;
  /** 모델의 원시 텍스트 출력을 반환한다. JSON 파싱·검증은 호출자 책임. */
  generate(input: TextGenerationInput): Promise<string>;
}

export const TEXT_GENERATION_PROVIDER = Symbol('TEXT_GENERATION_PROVIDER');
