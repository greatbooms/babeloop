import { expect, Page, test } from '@playwright/test';

test.setTimeout(180_000);

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('이메일').fill(email);
  await page.getByLabel('비밀번호').fill(password);
  await page.getByRole('button', { name: '로그인' }).click();
}

test('정책검사 → 검토 → 검수·승인(계정 전환) → 실험 → 추적코드 내보내기', async ({ page }) => {
  const tag = Math.random().toString(36).slice(2, 8);
  const expCode = `T${tag.slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, 'X')}`;

  await login(page, 'admin@babeloop.local', 'changeme-admin');
  await page.getByRole('link', { name: '광고' }).click();
  await page.getByLabel('제목').fill(`ad-${tag}`);
  await page.getByLabel('광고 문구').fill(`주인공 경험 ${tag}`);
  await page.getByRole('button', { name: '광고 등록' }).click();
  await expect(
    page.locator('li', { hasText: `ad-${tag}` }).getByText('ANALYZED'),
  ).toBeVisible({ timeout: 30_000 });

  await page.getByRole('link', { name: '브리프' }).click();
  await page.getByLabel('포커스').fill(`검토 e2e ${tag}`);
  await page.getByRole('button', { name: '브리프 생성' }).click();
  const briefCard = page.locator('li', { hasText: `검토 e2e ${tag}` }).first();
  await expect(briefCard).toBeVisible({ timeout: 30_000 });
  await briefCard.getByRole('button', { name: '문구 변형 3개 생성' }).click();
  await expect(briefCard.getByText('[MOCK zh-TW]').first()).toBeVisible({ timeout: 60_000 });

  await page.getByRole('link', { name: '검토' }).click();
  const card = page
    .locator('li', { hasText: `검토 e2e ${tag}` })
    .filter({ hasText: '[MOCK 문구 1]' })
    .first();
  await card.getByRole('button', { name: '정책 검사' }).click();
  await expect(card.getByText('POLICY_CHECKED')).toBeVisible({ timeout: 30_000 });
  await card.getByRole('button', { name: '검토 요청' }).click();
  await expect(card.getByText('IN_REVIEW')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: '로그아웃' }).click();
  await login(page, 'reviewer@babeloop.local', 'changeme-reviewer');
  await page.getByRole('link', { name: '검토' }).click();
  const reviewerCard = page
    .locator('li', { hasText: `검토 e2e ${tag}` })
    .filter({ hasText: '[MOCK 문구 1]' })
    .first();
  await reviewerCard.getByLabel('zh-TW 수정').fill(`最終審校完成 ${tag}`);
  await reviewerCard.getByRole('button', { name: '수정 저장' }).click();
  await reviewerCard.getByRole('button', { name: '현지화 승인' }).click();
  await expect(reviewerCard.getByText('LOCALIZATION_APPROVED')).toBeVisible({ timeout: 15_000 });
  await reviewerCard.getByRole('button', { name: '최종 승인' }).click();
  await expect(reviewerCard.getByText('APPROVED', { exact: true })).toBeVisible({ timeout: 15_000 });

  await page.getByRole('link', { name: '실험' }).click();
  await page.getByLabel('실험 코드').fill(expCode);
  await page.getByLabel('실험 이름').fill(`E2E 실험 ${tag}`);
  await page.getByRole('button', { name: '실험 생성' }).click();
  const experimentCard = page.locator('li', { hasText: `E2E 실험 ${tag}` });
  await expect(experimentCard).toBeVisible({ timeout: 10_000 });

  await page.getByRole('link', { name: '검토' }).click();
  const approvedCard = page
    .locator('li', { hasText: `검토 e2e ${tag}` })
    .filter({ hasText: '[MOCK 문구 1]' })
    .first();
  await approvedCard.getByLabel('실험 선택').selectOption({ label: `E2E 실험 ${tag}` });
  await approvedCard.getByRole('button', { name: '실험에 추가' }).click();
  await expect(approvedCard.getByText(`BL-${expCode}-V1-R1`)).toBeVisible({ timeout: 10_000 });

  await page.getByRole('link', { name: '실험' }).click();
  const exportCard = page.locator('li', { hasText: `E2E 실험 ${tag}` });
  await exportCard.getByRole('button', { name: '내보내기' }).click();
  const fileLink = exportCard.getByRole('link', { name: `BL-${expCode}-V1-R1.txt` });
  await expect(fileLink).toBeVisible({ timeout: 15_000 });

  const url = await fileLink.getAttribute('href');
  const response = await page.request.get(url!);
  expect(response.ok()).toBeTruthy();
  const body = await response.text();
  expect(body).toContain(`BL-${expCode}-V1-R1`);
  expect(body).toContain(`最終審校完成 ${tag}`);
});
