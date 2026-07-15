import { expect, test } from '@playwright/test';
import path from 'path';

test('이미지 업로드 → 분석 완료 → OCR 결과 표시', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('이메일').fill('admin@babeloop.local');
  await page.getByLabel('비밀번호').fill('changeme-admin');
  await page.getByRole('button', { name: '로그인' }).click();

  await page.getByRole('link', { name: '미디어' }).click();
  await expect(page.getByRole('heading', { name: '미디어' })).toBeVisible();

  await page.setInputFiles('input[type=file]', path.join(__dirname, 'fixtures/sample.png'));
  await page.getByRole('button', { name: '업로드' }).click();

  await expect(page.getByText('[MOCK OCR]').first()).toBeVisible({ timeout: 30_000 });
});
