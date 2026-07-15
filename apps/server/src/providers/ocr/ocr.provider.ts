export interface OcrInput {
  buffer: Buffer;
  contentType: string;
  filename?: string;
}

export interface OcrOutput {
  text: string;
}

export interface OcrProvider {
  readonly name: string;
  readonly model: string;
  extractText(input: OcrInput): Promise<OcrOutput>;
}

export const OCR_PROVIDER = Symbol('OCR_PROVIDER');
