import type { Lang } from './lang-context';

export function formatDate(value: string | number | Date, lang: Lang) {
  return new Intl.DateTimeFormat(lang === 'zhTw' ? 'zh-TW' : 'ko-KR').format(new Date(value));
}
