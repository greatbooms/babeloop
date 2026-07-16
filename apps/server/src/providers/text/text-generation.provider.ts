export type ResponseHint =
  | 'creative-analysis'
  | 'creative-brief'
  | 'copy-variants'
  | 'video-script'
  | 'zh-tw-localization';

export interface TextGenerationInput {
  system: string;
  prompt: string;
  /** 실제 Provider에서는 structured output 스키마 선택에, Mock에서는 응답 형태 분기에 사용 */
  responseHint?: ResponseHint;
}

export interface TextGenerationProvider {
  readonly name: string;
  readonly model: string;
  /** 모델의 원시 텍스트 출력을 반환한다. JSON 파싱·검증은 호출자 책임. */
  generate(input: TextGenerationInput): Promise<string>;
}

export const TEXT_GENERATION_PROVIDER = Symbol('TEXT_GENERATION_PROVIDER');
