import { expect, Page, test } from '@playwright/test';

test.setTimeout(240_000);

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('이메일').fill(email);
  await page.getByLabel('비밀번호').fill(password);
  await page.getByRole('button', { name: '로그인' }).click();
}

test('MVP 전체 루프 — 승인·내보내기 소재의 성과 업로드 → 퍼널 → 브리프 환류', async ({ page }) => {
  const tag = Math.random().toString(36).slice(2, 8);
  const expCode = `T${tag.slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, 'X')}`;
  const trackingCode = `BL-${expCode}-V1-R1`;

  await login(page, 'admin@babeloop.local', 'changeme-admin');
  await page.getByRole('link', { name: '광고' }).click();
  await expect(page.getByRole('heading', { name: '광고', exact: true })).toBeVisible();
  await page.getByLabel('제목', { exact: true }).fill(`ad-${tag}`);
  await page.getByLabel('광고 문구').fill(`주인공 경험 ${tag}`);
  await page.getByRole('button', { name: '광고 등록' }).click();
  await expect(
    page.locator('li', { hasText: `ad-${tag}` }).getByText('ANALYZED'),
  ).toBeVisible({ timeout: 30_000 });

  await page.getByRole('link', { name: '브리프' }).click();
  await page.getByLabel('포커스').fill(`성과 e2e ${tag}`);
  await page.getByRole('button', { name: '브리프 생성' }).click();
  const briefCard = page.locator('li', { hasText: `성과 e2e ${tag}` }).first();
  await expect(briefCard).toBeVisible({ timeout: 30_000 });
  await briefCard.getByRole('button', { name: '문구 변형 3개 생성' }).click();
  await expect(briefCard.getByText('[MOCK zh-TW]').first()).toBeVisible({ timeout: 60_000 });

  await page.getByRole('link', { name: '검토' }).click();
  const card = page
    .locator('li', { hasText: `성과 e2e ${tag}` })
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
    .locator('li', { hasText: `성과 e2e ${tag}` })
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
  await expect(page.locator('li', { hasText: `E2E 실험 ${tag}` })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('link', { name: '검토' }).click();
  const approvedCard = page
    .locator('li', { hasText: `성과 e2e ${tag}` })
    .filter({ hasText: '[MOCK 문구 1]' })
    .first();
  await approvedCard.getByLabel('실험 선택').selectOption({ label: `E2E 실험 ${tag}` });
  await approvedCard.getByRole('button', { name: '실험에 추가' }).click();
  await expect(approvedCard.getByText(trackingCode)).toBeVisible({ timeout: 10_000 });

  await page.getByRole('link', { name: '실험' }).click();
  const exportCard = page.locator('li', { hasText: `E2E 실험 ${tag}` });
  await exportCard.getByRole('button', { name: '내보내기' }).click();
  await expect(exportCard.getByRole('link', { name: `${trackingCode}.txt` })).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole('link', { name: '성과' }).click();
  await expect(page.getByRole('heading', { name: '성과', exact: true })).toBeVisible();
  const csv = [
    'date,platform,tracking_code,impressions,clicks,installs,signups,first_messages,cost,currency',
    `2026-07-10,META,${trackingCode},1000,50,10,5,3,2500,TWD`,
    `2026-07-11,META,${trackingCode},1200,66,12,7,4,3000,TWD`,
  ].join('\n');
  await page.getByLabel('성과 CSV').setInputFiles({
    name: 'perf.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  });
  await page.getByRole('button', { name: '성과 업로드' }).click();
  await expect(page.getByText('신규 2행')).toBeVisible({ timeout: 15_000 });

  await page.getByLabel('실험').selectOption({ label: `E2E 실험 ${tag}` });
  const performanceRow = page.locator('tr', { hasText: trackingCode });
  await expect(performanceRow.locator('td').nth(2)).toHaveText('2,200');
  await expect(performanceRow.locator('td').nth(7)).toHaveText('12');
  await page.getByRole('button', { name: '이 성과로 브리프 생성' }).click();
  await expect(page.getByText('브리프가 생성되었습니다')).toBeVisible({ timeout: 30_000 });

  await page.getByRole('link', { name: '브리프' }).click();
  await expect(page.locator('li', { hasText: '[MOCK 브리프]' }).first()).toBeVisible({ timeout: 15_000 });
});
