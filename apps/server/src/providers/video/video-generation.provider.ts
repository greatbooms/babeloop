export interface VideoGenerationInput {
  prompt: string;
  seconds: 4 | 8 | 12;
  size?: string;
}

export interface GeneratedVideoData {
  buffer: Buffer;
  contentType: string;
}

export interface VideoGenerationOutput {
  video: GeneratedVideoData;
  costEstimateUsd?: number;
}

export interface VideoGenerationProvider {
  readonly name: string;
  readonly model: string;
  generate(input: VideoGenerationInput): Promise<VideoGenerationOutput>;
}

export const VIDEO_GENERATION_PROVIDER = Symbol('VIDEO_GENERATION_PROVIDER');
