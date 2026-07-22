import assert from 'node:assert/strict';
import test from 'node:test';
import { getMessage, resolveInitialLang } from '../src/i18n/lang-context';

function storage(values: Record<string, string | null>) {
  return { getItem: (key: string) => values[key] ?? null };
}

test('resolves the global language before the legacy brief language and defaults to Korean', () => {
  assert.equal(resolveInitialLang(storage({ 'babeloop-lang': 'zhTw', 'babeloop-brief-lang': 'ko' })), 'zhTw');
  assert.equal(resolveInitialLang(storage({ 'babeloop-brief-lang': 'zhTw' })), 'zhTw');
  assert.equal(resolveInitialLang(storage({})), 'ko');
});

test('falls back to the exact Korean message when a Traditional Chinese key is missing', () => {
  const dictionary = {
    ko: { common: { onlyKorean: '한국어 원문' } },
    zhTw: { common: {} },
  };

  assert.equal(getMessage(dictionary, 'zhTw', 'common.onlyKorean'), '한국어 원문');
});

test('interpolates dynamic values without changing the translated template', () => {
  const dictionary = { ko: { common: { count: '변형 {count}개' } }, zhTw: { common: { count: '變體 {count} 個' } } };
  assert.equal(getMessage(dictionary, 'ko', 'common.count', { count: 3 }), '변형 3개');
  assert.equal(getMessage(dictionary, 'zhTw', 'common.count', { count: 3 }), '變體 3 個');
});
