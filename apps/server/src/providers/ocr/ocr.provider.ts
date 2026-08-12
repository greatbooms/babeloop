export interface OcrInput {
  buffer: Buffer;
  contentType: string;
  filename?: string;
}

export interface OcrOutput {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
  costEstimateUsd?: number;
}

export interface VisualDescriptionInput {
  buffer: Buffer;
  contentType: string;
}

export type VisualDescriptionOutput = OcrOutput;

export const VISUAL_DESCRIPTION_PROMPT_VERSION = 'describe-visual@v1';

export interface OcrProvider {
  readonly name: string;
  readonly model: string;
  extractText(input: OcrInput): Promise<OcrOutput>;
  describe(input: VisualDescriptionInput): Promise<VisualDescriptionOutput>;
}

export const OCR_PROVIDER = Symbol('OCR_PROVIDER');
