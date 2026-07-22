import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { formatDate } from '../src/i18n/format-date';
import { STATUS_LABELS } from '../src/lib/status-labels';
import { pageGuides } from '../src/lib/page-guides';

test('keeps the existing Korean status label and adds a Traditional Chinese label', () => {
  assert.equal(STATUS_LABELS.ANALYZED.ko, '분석 완료');
  assert.equal(STATUS_LABELS.ANALYZED.zhTw, '分析完成');
});

test('formats dates with the locale selected by the global language', () => {
  const value = new Date('2026-07-22T00:00:00.000Z');
  assert.equal(formatDate(value, 'ko'), new Intl.DateTimeFormat('ko-KR').format(value));
  assert.equal(formatDate(value, 'zhTw'), new Intl.DateTimeFormat('zh-TW').format(value));
});

test('provides every page guide in both languages', () => {
  for (const guide of Object.values(pageGuides)) {
    assert.ok(guide.ko.steps.length > 0);
    assert.equal(guide.ko.steps.length, guide.zhTw.steps.length);
  }
});

test('routes the app loading label through the global language dictionary', () => {
  const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, />로딩 중…</);
  assert.match(source, /t\('common\.loading'\)/);
});
