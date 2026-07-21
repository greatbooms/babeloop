import { expect, test } from '@playwright/test';
import path from 'path';

test('이미지 업로드 → 상세 → OCR → 미디어 인사이트 표시', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('이메일').fill('admin@babeloop.local');
  await page.getByLabel('비밀번호').fill('changeme-admin');
  await page.getByRole('button', { name: '로그인' }).click();

  await page.getByRole('link', { name: '미디어' }).click();
  await expect(page.getByRole('heading', { name: '미디어' })).toBeVisible();

  await page.setInputFiles('input[type=file]', path.join(__dirname, 'fixtures/sample.png'));
  await page.getByRole('button', { name: '업로드' }).click();

  await page.getByRole('link', { name: '← 미디어 목록' }).click();
  const card = page.locator('li', { hasText: 'sample.png' }).first();
  await card.getByRole('link', { name: '상세 보기 →' }).click();
  await expect(page.getByText('[MOCK OCR]').first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: '인사이트 분석' }).click();
  await expect(page.getByText('[MOCK 미디어 인사이트]').first()).toBeVisible({ timeout: 30_000 });
});
