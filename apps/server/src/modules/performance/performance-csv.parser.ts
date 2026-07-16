import { parseTrackingCode } from '../../common/tracking-code';

export interface PerformanceRow {
  date: Date;
  platform: 'META' | 'TIKTOK' | 'OTHER';
  trackingCode: string;
  impressions: number | null;
  clicks: number | null;
  installs: number | null;
  signups: number | null;
  firstMessages: number | null;
  cost: number | null;
  currency: string;
}

export interface PerformanceParseResult {
  rows: PerformanceRow[];
  errors: string[];
}

const REQUIRED_HEADERS = [
  'date',
  'platform',
  'tracking_code',
  'impressions',
  'clicks',
  'installs',
  'signups',
  'first_messages',
  'cost',
  'currency',
];

export function parsePerformanceCsv(buffer: Buffer): PerformanceParseResult {
  const text = buffer.toString('utf8').replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const rows: PerformanceRow[] = [];
  const errors: string[] = [];
  if (lines.length === 0) return { rows, errors: ['필수 헤더가 없습니다'] };

  const header = parseCsvLine(lines[0]).map((value) => value.trim());
  const index = new Map(header.map((name, position) => [name, position]));
  const missing = REQUIRED_HEADERS.filter((name) => !index.has(name));
  if (missing.length > 0) {
    return { rows, errors: [`필수 컬럼 누락: ${missing.join(', ')}`] };
  }

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex++) {
    const columns = parseCsvLine(lines[lineIndex]);
    const get = (name: string) => (columns[index.get(name)!] ?? '').trim();
    try {
      const rawDate = get('date');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) throw new Error('date 형식 오류');
      const date = new Date(`${rawDate}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== rawDate) {
        throw new Error('date 값 오류');
      }

      const platform = get('platform').toUpperCase();
      if (platform !== 'META' && platform !== 'TIKTOK' && platform !== 'OTHER') {
        throw new Error(`platform 값 오류: ${get('platform')}`);
      }

      const trackingCode = get('tracking_code');
      if (!parseTrackingCode(trackingCode)) throw new Error(`추적코드 형식 오류: ${trackingCode}`);

      rows.push({
        date,
        platform,
        trackingCode,
        impressions: parseNonNegativeInteger(get('impressions'), 'impressions'),
        clicks: parseNonNegativeInteger(get('clicks'), 'clicks'),
        installs: parseNonNegativeInteger(get('installs'), 'installs'),
        signups: parseNonNegativeInteger(get('signups'), 'signups'),
        firstMessages: parseNonNegativeInteger(get('first_messages'), 'first_messages'),
        cost: parseNonNegativeCost(get('cost')),
        currency: get('currency') || 'TWD',
      });
    } catch (error) {
      errors.push(`행 ${lineIndex + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { rows, errors };
}

function parseNonNegativeInteger(raw: string, field: string): number | null {
  if (raw === '') return null;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new Error(`${field} 정수 형식 오류`);
  if (value < 0) throw new Error(`${field} 음수는 허용되지 않습니다`);
  return value;
}

function parseNonNegativeCost(raw: string): number | null {
  if (raw === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error('cost 숫자 형식 오류');
  if (value < 0) throw new Error('cost 음수는 허용되지 않습니다');
  return value;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      values.push(value);
      value = '';
    } else {
      value += char;
    }
  }
  values.push(value);
  return values;
}
