export interface SensorTowerCreativeRow {
  advertiserAppId: string;
  advertiserAppName: string;
  creativeUrl: string;
  networks: string[];
  durationDays: number | null;
  firstSeen: Date | null;
  lastSeen: Date | null;
  impressionShare: number | null;
  countries: string[];
  type: string;
  format: string;
  placements: string[];
  dimensions: string | null;
  videoDurationSeconds: number | null;
}

export interface ParseResult {
  rows: SensorTowerCreativeRow[];
  errors: string[];
}

/** Sensor Tower Unified Creative Gallery 내보내기 — 확장자는 .csv지만 실제로는 탭 구분,
 *  인코딩은 UTF-16LE(BOM) 또는 UTF-8. (2026-07 실물 파일 기준) */
export function parseSensorTowerCreativeGalleryCsv(buffer: Buffer): ParseResult {
  const text =
    buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe
      ? buffer.toString('utf16le').replace(/^﻿/, '')
      : buffer.toString('utf8').replace(/^﻿/, '');

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const errors: string[] = [];
  const rows: SensorTowerCreativeRow[] = [];
  if (lines.length < 2) return { rows, errors: ['데이터 행이 없습니다'] };

  const unq = (s: string) => s.replace(/^"|"$/g, '').trim();
  const header = lines[0].split('\t').map(unq);
  const idx = (name: string) => header.indexOf(name);
  const required = ['Advertiser App Name', 'Creative URL', 'First Seen', 'Last Seen'];
  const missing = required.filter((c) => idx(c) < 0);
  if (missing.length > 0) return { rows, errors: [`필수 컬럼 누락: ${missing.join(', ')}`] };

  const num = (s: string) => (s === '' || Number.isNaN(Number(s)) ? null : Number(s));
  const date = (s: string) => (s === '' || Number.isNaN(Date.parse(s)) ? null : new Date(s));
  const list = (s: string) => (s === '' ? [] : s.split(',').map((x) => x.trim()).filter(Boolean));

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t').map(unq);
    const get = (name: string) => (idx(name) >= 0 ? (cols[idx(name)] ?? '') : '');
    const creativeUrl = get('Creative URL');
    if (!creativeUrl) {
      errors.push(`행 ${i + 1}: Creative URL 없음`);
      continue;
    }
    rows.push({
      advertiserAppId: get('Advertiser App ID'),
      advertiserAppName: get('Advertiser App Name'),
      creativeUrl,
      networks: list(get('Networks')),
      durationDays: num(get('Duration')),
      firstSeen: date(get('First Seen')),
      lastSeen: date(get('Last Seen')),
      impressionShare: num(get('Impression Share')),
      countries: list(get('Countries')),
      type: get('Type') || 'other',
      format: get('Format') || 'other',
      placements: list(get('Placements')),
      dimensions: get('Dimensions') || null,
      videoDurationSeconds: num(get('Video Duration')),
    });
  }
  return { rows, errors };
}
