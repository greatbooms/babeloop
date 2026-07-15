export interface SttInput {
  buffer: Buffer;
  contentType: string;
  filename?: string;
}

export interface SttOutput {
  text: string;
  language?: string;
}

export interface SttProvider {
  readonly name: string;
  readonly model: string;
  transcribe(input: SttInput): Promise<SttOutput>;
}

export const STT_PROVIDER = Symbol('STT_PROVIDER');
