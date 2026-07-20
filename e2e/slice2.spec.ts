import { expect, test } from '@playwright/test';

test('광고 2개 등록 → 분석 → 유사 광고 검색', async ({ page }) => {
  const stamp = Date.now();
  const sharedText = `完全相同的廣告文案-${stamp}`;

  await page.goto('/');
  await page.getByLabel('이메일').fill('admin@babeloop.local');
  await page.getByLabel('비밀번호').fill('changeme-admin');
  await page.getByRole('button', { name: '로그인' }).click();

  await page.getByRole('link', { name: '광고' }).click();
  await expect(page.getByRole('heading', { name: '광고', exact: true })).toBeVisible();

  for (const title of [`A-${stamp}`, `B-${stamp}`]) {
    await page.getByLabel('제목').fill(title);
    await page.getByLabel('광고 문구').fill(sharedText);
    await page.getByRole('button', { name: '광고 등록' }).click();
    await expect(page.getByText(title)).toBeVisible();
  }

  await expect(page.getByText('ANALYZED').first()).toBeVisible({ timeout: 30_000 });

  const rowA = page.locator('li', { hasText: `A-${stamp}` });
  await expect(rowA.getByText('ANALYZED')).toBeVisible({ timeout: 30_000 });
  const rowB = page.locator('li', { hasText: `B-${stamp}` });
  await expect(rowB.getByText('ANALYZED')).toBeVisible({ timeout: 30_000 });

  await rowA.getByRole('link', { name: '상세 보기 →' }).click();
  await page.getByRole('button', { name: '유사 광고' }).click();
  await expect(page.getByText(`B-${stamp}`)).toBeVisible({ timeout: 10_000 });
});
