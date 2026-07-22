import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('BriefDetailPage relies only on the global language control', async () => {
  const source = await readFile(new URL('../src/pages/BriefDetailPage.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /babeloop-brief-lang/);
  assert.doesNotMatch(source, /className="lang-toggle"/);
  assert.match(source, /const \{ lang, t \} = useT\(\)/);
});
