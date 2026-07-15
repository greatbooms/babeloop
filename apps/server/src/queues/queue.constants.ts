export const MEDIA_PROCESSING_QUEUE = 'media-processing';

export const JOB_TYPES = {
  PROCESS_MEDIA: 'process-media',
} as const;

// BullMQ 커스텀 jobId에는 ':'를 쓸 수 없다 (Redis 키 구분자로 예약) — 구분자는 '--'
export function processMediaJobId(mediaAssetId: string): string {
  return `${JOB_TYPES.PROCESS_MEDIA}--${mediaAssetId}`;
}

/** BullMQ connection 옵션 — ioredis는 옵션 객체에서 url을 파싱하지 않으므로 직접 분해한다 */
export function redisConnectionFromUrl(url: string): { host: string; port: number } {
  const u = new URL(url);
  return { host: u.hostname, port: Number(u.port || 6379) };
}
