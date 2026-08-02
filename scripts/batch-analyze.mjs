// 경쟁 광고 일괄 분석 — 집행 기간 상위 N건의 텍스트 추출→분석을 순차 실행한다.
// 실행 중인 서버(GraphQL)를 통해 UI와 동일한 가드·재시도 경로를 태우고, 실패는 건너뛰고 계속한다.
// 사용법: node scripts/batch-analyze.mjs --limit 100 --yes
//        (--yes 없으면 대상 목록·예상 비용만 출력하는 드라이런)
import { PrismaClient } from '../apps/server/generated/prisma/index.js';

const BASE = process.env.BABELOOP_URL ?? 'http://localhost:16000';
const EMAIL = process.env.BABELOOP_ADMIN_EMAIL ?? 'admin@babeloop.local';
const PASSWORD = process.env.BABELOOP_ADMIN_PASSWORD ?? 'changeme-admin';
const limit = Number(process.argv[process.argv.indexOf('--limit') + 1] || 100);
const confirmed = process.argv.includes('--yes');
const JOB_TIMEOUT_MS = 180_000;

const prisma = new PrismaClient();
let cookie = '';

async function gql(query, variables) {
  const res = await fetch(`${BASE}/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ query, variables }),
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors[0].message);
  return body.data;
}

async function waitJob(jobId) {
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const data = await gql('query($id:ID!){job(id:$id){status error}}', { id: jobId });
    const job = data.job;
    if (job?.status === 'SUCCEEDED') return { ok: true };
    if (job?.status === 'FAILED') return { ok: false, error: job.error };
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return { ok: false, error: `타임아웃 (${JOB_TIMEOUT_MS / 1000}s)` };
}

async function main() {
  const candidates = await prisma.$queryRawUnsafe(`
    SELECT s.id, s.title, s."adText" IS NOT NULL AS has_ad_text, s."mediaAssetId", m.kind,
           (SELECT COUNT(*) FROM ocr_results o WHERE o."mediaAssetId" = m.id) AS ocr_count,
           (SELECT COUNT(*) FROM transcriptions t WHERE t."mediaAssetId" = m.id) AS stt_count
    FROM source_ads s LEFT JOIN media_assets m ON m.id = s."mediaAssetId"
    WHERE s.status != 'ANALYZED'
    ORDER BY (s."lastSeenAt" - s."firstSeenAt") DESC NULLS LAST
    LIMIT ${limit}`);

  console.log(`대상 ${candidates.length}건 (집행 기간 상위, 미분석만)`);
  if (!confirmed) {
    console.log('드라이런입니다. 실제 실행은 --yes 를 붙이세요. 예상 비용: 건당 약 1.5~3센트 (추출+분석, 실제 AI 호출 발생)');
    return;
  }

  await gql('mutation($e:String!,$p:String!){login(email:$e,password:$p){id}}', { e: EMAIL, p: PASSWORD });

  const started = new Date();
  const failures = [];
  let done = 0;

  for (const ad of candidates) {
    const label = `[${done + 1}/${candidates.length}] ${ad.title?.slice(0, 30) ?? ad.id}`;
    try {
      const hasText = ad.has_ad_text || Number(ad.ocr_count) > 0 || Number(ad.stt_count) > 0;
      if (!hasText) {
        if (!ad.mediaAssetId) throw new Error('텍스트도 미디어도 없음');
        const extract = await gql('mutation($id:ID!){processMediaAsset(mediaAssetId:$id){id}}', { id: ad.mediaAssetId });
        const extracted = await waitJob(extract.processMediaAsset.id);
        if (!extracted.ok) throw new Error(`추출 실패: ${extracted.error}`);
      }
      const analyze = await gql('mutation($input:AnalyzeSourceAdInput!){analyzeSourceAd(input:$input){id}}', { input: { sourceAdId: ad.id } });
      const analyzed = await waitJob(analyze.analyzeSourceAd.id);
      if (!analyzed.ok) throw new Error(`분석 실패: ${analyzed.error}`);
      done += 1;
      console.log(`${label} ✓`);
    } catch (error) {
      failures.push({ id: ad.id, title: ad.title, reason: error.message });
      console.log(`${label} ✗ ${error.message}`);
    }
  }

  const logs = await prisma.aiExecutionLog.groupBy({
    by: ['model'],
    where: { createdAt: { gte: started }, provider: 'openai' },
    _count: true,
    _sum: { inputTokens: true, outputTokens: true },
  });
  console.log('\n=== 결과 ===');
  console.log(`성공 ${done}건 / 실패 ${failures.length}건 / 소요 ${Math.round((Date.now() - started.getTime()) / 60000)}분`);
  for (const failure of failures) console.log(`  실패: ${failure.title ?? failure.id} — ${failure.reason}`);
  console.log('AI 호출 집계:');
  for (const log of logs) console.log(`  ${log.model}: ${log._count}회, in ${log._sum.inputTokens ?? '-'} / out ${log._sum.outputTokens ?? '-'} 토큰`);
}

main()
  .catch((error) => { console.error('배치 중단:', error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
