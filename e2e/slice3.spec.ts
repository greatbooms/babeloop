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
  await page.getByLabel('제목').fill(`RAG-${stamp}`);
  await page.getByLabel('광고 문구').fill(`이야기의 주인공이 되는 경험 ${stamp}`);
  await page.getByRole('button', { name: '광고 등록' }).click();
  const ragRow = page.locator('li', { hasText: `RAG-${stamp}` });
  await expect(ragRow.getByText('ANALYZED')).toBeVisible({ timeout: 30_000 });

  // 브리프 생성 — dev DB에 이전 실행의 브리프가 남아 있으므로 반드시 이번 실행의 스탬프로 카드를 특정한다
  await page.getByRole('link', { name: '브리프' }).click();
  await expect(page.getByRole('heading', { name: '브리프', exact: true })).toBeVisible();
  await page.getByLabel('포커스').fill(`주인공이 되는 로맨스 ${stamp}`);
  await page.getByRole('button', { name: '브리프 생성' }).click();
  const briefCard = page.locator('li', { hasText: `주인공이 되는 로맨스 ${stamp}` }).first();
  await expect(briefCard).toBeVisible({ timeout: 30_000 });

  // 변형 3개 + zh-TW 초안
  await briefCard.getByRole('button', { name: '문구 변형 3개 생성' }).click();
  await expect(briefCard.getByText('[MOCK 문구 1]')).toBeVisible({ timeout: 30_000 });
  await expect(briefCard.getByText('[MOCK 문구 3]')).toBeVisible({ timeout: 30_000 });
  await expect(briefCard.getByText('[MOCK zh-TW]').first()).toBeVisible({ timeout: 30_000 });
});
