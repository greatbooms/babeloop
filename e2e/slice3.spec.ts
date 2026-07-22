import { expect, test } from '@playwright/test';

// 광고 분석 → 브리프 → 변형 → 현지화 4단계 비동기 체인이라 기본 30초로는 부족하다
test.setTimeout(120_000);

test('브리프 생성 → 변형 3개 → zh-TW 초안 표시', async ({ page }) => {
  const stamp = Date.now();

  await page.goto('/');
  await page.getByLabel('이메일').fill('admin@babeloop.local');
  await page.getByLabel('비밀번호').fill('changeme-admin');
  await page.getByRole('button', { name: '로그인' }).click();

  // RAG 소스: 광고 1개 등록하고 분석 완료까지 대기
  await page.getByRole('link', { name: '광고' }).click();
  await page.getByRole('button', { name: '새 광고 등록' }).click();
  await page.getByLabel('제목').fill(`RAG-${stamp}`);
  await page.getByLabel('광고 문구').fill(`이야기의 주인공이 되는 경험 ${stamp}`);
  await page.getByRole('button', { name: '광고 등록', exact: true }).click();
  const ragRow = page.locator('li', { hasText: `RAG-${stamp}` });
  await expect(ragRow.getByText('ANALYZED')).toBeVisible({ timeout: 30_000 });

  // 브리프 생성 — 포커스는 위 광고 문구와 동일 문자열: mock 임베딩은 같은 텍스트 → 같은 벡터라 유사도 1.0으로 RAG-{stamp}가 반드시 top-3에 든다
  await page.getByRole('link', { name: '브리프' }).click();
  await expect(page.getByRole('heading', { name: '브리프', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '새 브리프 생성' }).click();
  await page.getByLabel('포커스').fill(`이야기의 주인공이 되는 경험 ${stamp}`);
  await page.getByRole('button', { name: '브리프 생성', exact: true }).click();

  // 생성 완료 시 새 브리프 상세로 자동 이동한다 — 변형 3개 + zh-TW 초안
  await expect(page.getByRole('button', { name: '문구 변형 3개 생성' })).toBeVisible({ timeout: 30_000 });
  const provenance = page.getByRole('heading', { name: '이 브리프가 참고한 것' }).locator('..');
  await expect(provenance.getByText(`RAG-${stamp}`)).toBeVisible();
  await expect(provenance.getByText(/자동 검색/).first()).toBeVisible();
  await page.getByRole('button', { name: '문구 변형 3개 생성' }).click();
  await expect(page.getByText('[MOCK 문구 1]')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('[MOCK 문구 3]')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('[MOCK zh-TW]').first()).toBeVisible({ timeout: 30_000 });
});
