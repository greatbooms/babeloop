export type ImageQuality = 'low' | 'high';
export type ImageGenerationSize = '1024x1024' | '1536x1024' | '1024x1536';

export interface ImageGenerationInput {
  prompt: string;
  count: number;
  quality: ImageQuality;
  size?: ImageGenerationSize;
  referenceImages?: Array<{ buffer: Buffer; contentType: string }>;
}

export interface GeneratedImageData {
  buffer: Buffer;
  contentType: string;
}

export interface ImageGenerationOutput {
  images: GeneratedImageData[];
  costEstimateUsd?: number;
}

export interface ImageGenerationProvider {
  readonly name: string;
  readonly model: string;
  generate(input: ImageGenerationInput): Promise<ImageGenerationOutput>;
}

export const IMAGE_GENERATION_PROVIDER = Symbol('IMAGE_GENERATION_PROVIDER');
