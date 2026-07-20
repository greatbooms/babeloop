export type StatusTone = 'positive' | 'progress' | 'neutral' | 'warn';

export const STATUS_LABELS: Record<string, { ko: string; tone: StatusTone }> = {
  REGISTERED: { ko: '등록됨', tone: 'neutral' },
  ANALYZING: { ko: '분석 중', tone: 'progress' },
  ANALYZED: { ko: '분석 완료', tone: 'positive' },
  FAILED: { ko: '실패', tone: 'warn' },
  PENDING: { ko: '업로드 대기', tone: 'neutral' },
  UPLOADED: { ko: '업로드됨', tone: 'neutral' },
  PROCESSING: { ko: '처리 중', tone: 'progress' },
  READY: { ko: '완료', tone: 'positive' },
  QUEUED: { ko: '대기 중', tone: 'neutral' },
  RUNNING: { ko: '실행 중', tone: 'progress' },
  SUCCEEDED: { ko: '성공', tone: 'positive' },
  DRAFT: { ko: '초안', tone: 'neutral' },
  POLICY_CHECKED: { ko: '정책 검사 완료', tone: 'progress' },
  IN_REVIEW: { ko: '검토 중', tone: 'progress' },
  LOCALIZATION_APPROVED: { ko: '현지화 승인', tone: 'progress' },
  APPROVED: { ko: '승인됨', tone: 'positive' },
  EXPORTED: { ko: '내보냄', tone: 'positive' },
  REVISION_REQUESTED: { ko: '수정 요청됨', tone: 'warn' },
  REJECTED: { ko: '거절됨', tone: 'warn' },
};
