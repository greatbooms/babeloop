export const MEDIA_PROCESSING_QUEUE = 'media-processing';
export const CREATIVE_ANALYSIS_QUEUE = 'creative-analysis';
export const EMBEDDING_QUEUE = 'embedding';
export const CREATIVE_GENERATION_QUEUE = 'creative-generation';
export const LOCALIZATION_QUEUE = 'localization';
export const POLICY_CHECK_QUEUE = 'policy-check';

export const JOB_TYPES = {
  PROCESS_MEDIA: 'process-media',
  GENERATE_THUMBNAIL: 'generate-thumbnail',
  ANALYZE_CREATIVE: 'analyze-creative',
  GENERATE_EMBEDDING: 'generate-embedding',
  DOWNLOAD_EXTERNAL_MEDIA: 'download-external-media',
  GENERATE_BRIEF: 'generate-brief',
  GENERATE_COPY_VARIANTS: 'generate-copy-variants',
  LOCALIZE_ZH_TW: 'localize-zh-tw',
  RUN_POLICY_CHECK: 'run-policy-check',
} as const;

// BullMQ 커스텀 jobId에는 ':'를 쓸 수 없다 (Redis 키 구분자로 예약) — 구분자는 '--'
export function processMediaJobId(mediaAssetId: string): string {
  return `${JOB_TYPES.PROCESS_MEDIA}--${mediaAssetId}`;
}

export function generateThumbnailJobId(mediaAssetId: string): string {
  return `${JOB_TYPES.GENERATE_THUMBNAIL}--${mediaAssetId}`;
}

export function analyzeCreativeJobId(sourceAdId: string): string {
  return `${JOB_TYPES.ANALYZE_CREATIVE}--${sourceAdId}`;
}

export function generateEmbeddingJobId(sourceAdId: string): string {
  return `${JOB_TYPES.GENERATE_EMBEDDING}--${sourceAdId}`;
}

export function downloadExternalMediaJobId(sourceAdId: string): string {
  return `${JOB_TYPES.DOWNLOAD_EXTERNAL_MEDIA}--${sourceAdId}`;
}

export function generateBriefJobId(requestId: string): string {
  return `${JOB_TYPES.GENERATE_BRIEF}--${requestId}`;
}

export function generateCopyVariantsJobId(briefId: string, requestId: string): string {
  return `${JOB_TYPES.GENERATE_COPY_VARIANTS}--${briefId}--${requestId}`;
}

export function localizeZhTwJobId(creativeId: string): string {
  return `${JOB_TYPES.LOCALIZE_ZH_TW}--${creativeId}`;
}

export function runPolicyCheckJobId(creativeId: string): string {
  return `${JOB_TYPES.RUN_POLICY_CHECK}--${creativeId}`;
}

/** BullMQ connection 옵션 — ioredis는 옵션 객체에서 url을 파싱하지 않으므로 직접 분해한다 */
export function redisConnectionFromUrl(url: string): { host: string; port: number } {
  const u = new URL(url);
  return { host: u.hostname, port: Number(u.port || 6379) };
}
