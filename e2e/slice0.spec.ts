import { expect, test } from '@playwright/test';

test('로그인 → 브랜드 등록 → 목록 표시', async ({ page }) => {
  const brandName = `BabeChat-${Date.now()}`;

  await page.goto('/');
  await page.getByLabel('이메일').fill('admin@babeloop.local');
  await page.getByLabel('비밀번호').fill('changeme-admin');
  await page.getByRole('button', { name: '로그인' }).click();

  await expect(page.getByRole('heading', { name: '브랜드' })).toBeVisible();

  await page.getByLabel('브랜드명').fill(brandName);
  await page.getByLabel('서비스 URL').fill('https://www.babechat.ai');
  await page.getByRole('button', { name: '브랜드 등록' }).click();

  await expect(page.getByText(brandName)).toBeVisible();
});
