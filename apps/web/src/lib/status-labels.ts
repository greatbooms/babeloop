export type StatusTone = 'positive' | 'progress' | 'neutral' | 'warn';

// 번체중문 번역은 초안이며 대만 검수자 감수 예정.
export const STATUS_LABELS: Record<string, { ko: string; zhTw: string; tone: StatusTone }> = {
  REGISTERED: { ko: '등록됨', zhTw: '已登錄', tone: 'neutral' },
  ANALYZING: { ko: '분석 중', zhTw: '分析中', tone: 'progress' },
  ANALYZED: { ko: '분석 완료', zhTw: '分析完成', tone: 'positive' },
  FAILED: { ko: '실패', zhTw: '失敗', tone: 'warn' },
  PENDING: { ko: '업로드 대기', zhTw: '等待上傳', tone: 'neutral' },
  UPLOADED: { ko: '업로드됨', zhTw: '已上傳', tone: 'neutral' },
  PROCESSING: { ko: '처리 중', zhTw: '處理中', tone: 'progress' },
  READY: { ko: '완료', zhTw: '完成', tone: 'positive' },
  QUEUED: { ko: '대기 중', zhTw: '佇列中', tone: 'neutral' },
  RUNNING: { ko: '실행 중', zhTw: '執行中', tone: 'progress' },
  SUCCEEDED: { ko: '성공', zhTw: '成功', tone: 'positive' },
  DRAFT: { ko: '초안', zhTw: '草稿', tone: 'neutral' },
  POLICY_CHECKED: { ko: '정책 검사 완료', zhTw: '政策檢查完成', tone: 'progress' },
  IN_REVIEW: { ko: '검토 중', zhTw: '審核中', tone: 'progress' },
  LOCALIZATION_APPROVED: { ko: '현지화 승인', zhTw: '在地化核准', tone: 'progress' },
  APPROVED: { ko: '승인됨', zhTw: '已核准', tone: 'positive' },
  EXPORTED: { ko: '내보냄', zhTw: '已匯出', tone: 'positive' },
  REVISION_REQUESTED: { ko: '수정 요청됨', zhTw: '已要求修改', tone: 'warn' },
  REJECTED: { ko: '거절됨', zhTw: '已拒絕', tone: 'warn' },
};
