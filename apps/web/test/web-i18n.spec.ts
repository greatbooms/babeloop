import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { formatDate } from '../src/i18n/format-date';
import { getMessage } from '../src/i18n/lang-context';
import { messages } from '../src/i18n/messages';
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

test('provides independent Korean and Traditional Chinese copy for every Snowflake sync state', () => {
  const keys = [
    'performance.snowflakeTitle',
    'performance.snowflakeDescription',
    'performance.snowflakeNotConfigured',
    'performance.syncNow',
    'performance.syncHint',
    'performance.syncing',
    'performance.syncFailed',
    'performance.lastSynced',
    'performance.neverSynced',
    'performance.dailySync',
    'performance.customSyncCron',
    'performance.autoSyncOff',
    'performance.syncSummary',
  ];

  for (const key of keys) {
    const ko = getMessage(messages, 'ko', key);
    const zhTw = getMessage(messages, 'zhTw', key);
    assert.notEqual(ko, key);
    assert.notEqual(zhTw, key);
    assert.notEqual(zhTw, ko);
  }
});

test('provides Korean and Traditional Chinese copy for every image size control', () => {
  const keys = [
    'review.imageSizePreset',
    'review.imageSizePresetHint',
    'review.imageSizeSquare1200x1200',
    'review.imageSizeLandscape600x500',
    'review.imageSizePortrait960x1200',
    'review.imageSizePortrait300x500',
    'review.imageSizeLandscape1200x628',
    'review.imageSizeBanner600x200',
    'review.imageSizeBanner908x226',
  ];

  for (const key of keys) {
    const ko = getMessage(messages, 'ko', key);
    const zhTw = getMessage(messages, 'zhTw', key);
    assert.notEqual(ko, key);
    assert.notEqual(zhTw, key);
    assert.notEqual(zhTw, ko);
  }

  assert.equal(
    getMessage(messages, 'ko', 'review.imageSizePresetHint'),
    '배너형(3:1·4:1)은 상하 크롭 폭이 커서 완성도가 떨어질 수 있습니다',
  );
});
