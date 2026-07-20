import { expect, test } from '@playwright/test';

test('로그인 → 브랜드 등록 → 상세 표시', async ({ page }) => {
  const brandName = `BabeChat-${Date.now()}`;

  await page.goto('/');
  await page.getByLabel('이메일').fill('admin@babeloop.local');
  await page.getByLabel('비밀번호').fill('changeme-admin');
  await page.getByRole('button', { name: '로그인' }).click();

  await expect(page.getByRole('heading', { name: '브랜드', exact: true })).toBeVisible();

  // 목록 → 등록 폼 열기 → 등록 → 상세 페이지로 이동하는 구조
  await page.getByRole('button', { name: '새 브랜드 등록' }).click();
  await page.getByLabel('브랜드명', { exact: true }).fill(brandName);
  await page.getByLabel('서비스 URL', { exact: true }).fill('https://www.babechat.ai');
  await page.getByRole('button', { name: '브랜드 등록', exact: true }).click();

  // 등록 직후 상세 페이지 — 브랜드명이 제목으로, 수정 버튼 존재
  await expect(page.getByRole('heading', { name: brandName })).toBeVisible();
  await expect(page.getByRole('button', { name: '수정' })).toBeVisible();

  // 목록으로 돌아가면 카드가 보인다
  await page.getByRole('link', { name: '← 브랜드 목록' }).click();
  await expect(page.getByText(brandName)).toBeVisible();
});
