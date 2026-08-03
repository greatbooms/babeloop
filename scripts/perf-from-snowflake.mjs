#!/usr/bin/env node
// ============================================================
//  perf-from-snowflake.mjs
//  Snowflake(BABECHAT_TW)에서 BL- 추적코드 기준 성과를 뽑아
//  BabeLoop 성과 CSV(성과 탭 업로드 형식)를 생성/업로드한다.
//
//  대시보드 프로젝트(babechat-tw-dashboard)와 같은 SNOWFLAKE_* 환경변수를
//  사용하므로, 친구에게 받은 .env를 --env로 그대로 지정하면 된다.
//
//  사용법:
//    node scripts/perf-from-snowflake.mjs inspect  [--env <envfile>]
//      → AIRBRIDGE 스키마 테이블 목록, WEB_EVENTS 필드 키 목록,
//        BL- 추적코드 검출 현황을 출력 (매칭 가능 여부 확정용)
//
//    node scripts/perf-from-snowflake.mjs extract --from 2026-08-01 --to 2026-08-07 \
//      [--env <envfile>] [--platform OTHER] [--out perf.csv] [--upload] [--yes]
//      → 가입(signups)을 소재별로 집계한 CSV 생성.
//        노출·클릭·비용은 광고 플랫폼 지표라 Snowflake에 없음 → 빈 값(null)로 두고
//        플랫폼 리포트 CSV로 별도 보완한다.
//        --upload 시 BabeLoop(기본 http://localhost:16000)에 로그인해 바로 임포트.
//
//  주의: AI 비용 없음(순수 DB 조회). Snowflake 웨어하우스 크레딧만 소모.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ---- CLI 파싱 ----
const argv = process.argv.slice(2);
const command = argv[0];
const flag = (name) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? (argv[index + 1]?.startsWith('--') ? true : argv[index + 1] ?? true) : undefined;
};
const has = (name) => argv.includes(`--${name}`);

if (command !== 'inspect' && command !== 'extract') {
  console.log('사용법: node scripts/perf-from-snowflake.mjs <inspect|extract> [옵션]');
  console.log('  inspect                       스키마·필드·BL-코드 검출 현황 확인');
  console.log('  extract --from A --to B       소재별 가입 집계 CSV 생성');
  console.log('  공통: --env <envfile>         SNOWFLAKE_* 가 담긴 env 파일 경로');
  console.log('  extract 추가: --platform OTHER|META|TIKTOK, --out <file>, --upload, --yes');
  process.exit(command ? 1 : 0);
}

// ---- env 로딩: --env 우선, 그다음 루트 .env ----
const envFile = typeof flag('env') === 'string' ? flag('env') : null;
if (envFile) {
  if (!fs.existsSync(envFile)) { console.error(`env 파일이 없습니다: ${envFile}`); process.exit(1); }
  dotenv.config({ path: envFile, override: false });
}
dotenv.config({ path: path.join(ROOT, '.env'), override: false });

const {
  SNOWFLAKE_ACCOUNT, SNOWFLAKE_USERNAME, SNOWFLAKE_PASSWORD,
  SNOWFLAKE_ROLE, SNOWFLAKE_WAREHOUSE, SNOWFLAKE_PRIVATE_KEY_PATH,
  SNOWFLAKE_PRIVATE_KEY_PASSPHRASE, SNOWFLAKE_DATABASE,
} = process.env;

if (!SNOWFLAKE_ACCOUNT || !SNOWFLAKE_USERNAME || (!SNOWFLAKE_PASSWORD && !SNOWFLAKE_PRIVATE_KEY_PATH)) {
  console.error('SNOWFLAKE_* 자격증명이 없습니다.');
  console.error('친구에게 받은 .env를 --env /path/to/.env 로 지정하거나, BabeLoop 루트 .env에 다음을 추가하세요:');
  console.error('  SNOWFLAKE_ACCOUNT= / SNOWFLAKE_USERNAME= / SNOWFLAKE_PASSWORD= (또는 SNOWFLAKE_PRIVATE_KEY_PATH=)');
  console.error('  SNOWFLAKE_ROLE= / SNOWFLAKE_WAREHOUSE=');
  process.exit(1);
}

const DB = SNOWFLAKE_DATABASE || 'BABECHAT_TW';
// 추적코드 패턴 — BabeLoop tracking-code 규칙과 동일 (BL-실험코드-변형-리비전)
const CODE_REGEX = 'BL-[A-Z0-9]+-V[0-9]+-R[0-9]+';
// 이벤트 타임스탬프·유저ID 후보 필드 — inspect 결과에 따라 여기만 고치면 된다
const TS_FIELDS = ['Event Datetime', 'Event Timestamp', 'Server Datetime', 'event_datetime'];
const UID_FIELDS = ['User ID', 'user_id', 'Airbridge Device ID'];

const coalesceFields = (fields, cast) =>
  `COALESCE(${fields.map((f) => `RAW_DATA:"${f}"::${cast}`).join(', ')})`;

// ---- Snowflake 연결 ----
const snowflake = (await import('snowflake-sdk')).default;
snowflake.configure({ logLevel: 'ERROR' });
const connOpts = {
  account: SNOWFLAKE_ACCOUNT,
  username: SNOWFLAKE_USERNAME,
  role: SNOWFLAKE_ROLE,
  warehouse: SNOWFLAKE_WAREHOUSE,
};
if (SNOWFLAKE_PRIVATE_KEY_PATH) {
  connOpts.authenticator = 'SNOWFLAKE_JWT';
  connOpts.privateKey = fs.readFileSync(SNOWFLAKE_PRIVATE_KEY_PATH, 'utf8');
  if (SNOWFLAKE_PRIVATE_KEY_PASSPHRASE) connOpts.privateKeyPass = SNOWFLAKE_PRIVATE_KEY_PASSPHRASE;
} else {
  connOpts.password = SNOWFLAKE_PASSWORD;
}

const conn = snowflake.createConnection(connOpts);
await new Promise((res, rej) => conn.connect((e) => (e ? rej(e) : res())));
const q = (sqlText) => new Promise((res, rej) =>
  conn.execute({ sqlText, complete: (e, _s, rows) => (e ? rej(e) : res(rows)) }));
const done = (code = 0) => conn.destroy(() => process.exit(code));

// ============================================================
// inspect — 매칭 가능 여부 확정용 진단
// ============================================================
if (command === 'inspect') {
  console.log(`\n=== ① ${DB}.AIRBRIDGE 테이블 목록 ===`);
  try {
    const tables = await q(`SHOW TABLES IN SCHEMA ${DB}.AIRBRIDGE`);
    for (const t of tables) console.log(`  - ${t.name ?? t.NAME}  (rows≈${t.rows ?? t.ROWS ?? '?'})`);
  } catch (e) { console.error('  실패:', e.message); }

  console.log(`\n=== ② WEB_EVENTS RAW_DATA 필드 키 (샘플 200행 합집합) ===`);
  try {
    const keys = await q(`SELECT DISTINCT f.key AS k
      FROM (SELECT RAW_DATA FROM ${DB}.AIRBRIDGE.WEB_EVENTS LIMIT 200) t, LATERAL FLATTEN(t.RAW_DATA) f
      ORDER BY 1`);
    console.log('  ' + keys.map((r) => r.K).join(' | '));
  } catch (e) { console.error('  실패:', e.message); }

  console.log(`\n=== ③ BL- 추적코드 검출 현황 (WEB_EVENTS 전체, 필드 무관 스캔) ===`);
  try {
    const codes = await q(`SELECT REGEXP_SUBSTR(TO_JSON(RAW_DATA), '${CODE_REGEX}') code, COUNT(*) n
      FROM ${DB}.AIRBRIDGE.WEB_EVENTS GROUP BY 1 HAVING code IS NOT NULL ORDER BY n DESC LIMIT 20`);
    if (codes.length === 0) {
      console.log('  아직 BL- 코드가 찍힌 이벤트가 없습니다. (광고 게재 전이면 정상 — utm_content가 심어진 광고가 나가면 여기 잡힙니다)');
    } else {
      for (const r of codes) console.log(`  ${r.CODE}: ${r.N}건`);
    }
  } catch (e) { console.error('  실패:', e.message); }

  console.log('\n②의 키 목록에 UTM/Campaign 계열 필드가 보이면 그 이름을 이 스크립트 상단 후보 배열에 반영하세요.');
  done();
}

// ============================================================
// extract — 소재별 가입 집계 → BabeLoop CSV
// ============================================================
const from = flag('from');
const to = flag('to');
if (!/^\d{4}-\d{2}-\d{2}$/.test(from ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(to ?? '')) {
  console.error('extract에는 --from YYYY-MM-DD --to YYYY-MM-DD 가 필요합니다.');
  done(1);
}
const platform = String(flag('platform') ?? 'OTHER').toUpperCase();
if (!['META', 'TIKTOK', 'OTHER'].includes(platform)) {
  console.error('--platform 은 META|TIKTOK|OTHER 중 하나여야 합니다.');
  done(1);
}

// 유저별 최초 터치(first-touch)의 추적코드 1개에 가입을 귀속한다.
// 필드명이 확정되기 전에도 동작하도록 TO_JSON 문자열에서 BL- 패턴을 직접 추출한다.
const sql = `
WITH touches AS (
  SELECT ${coalesceFields(UID_FIELDS, 'string')} uid,
         REGEXP_SUBSTR(TO_JSON(RAW_DATA), '${CODE_REGEX}') code,
         ${coalesceFields(TS_FIELDS, 'timestamp')} ts
  FROM ${DB}.AIRBRIDGE.WEB_EVENTS
  QUALIFY code IS NOT NULL AND uid IS NOT NULL
),
first_touch AS (
  SELECT uid, code
  FROM touches
  QUALIFY ROW_NUMBER() OVER (PARTITION BY uid ORDER BY ts NULLS LAST) = 1
),
signups AS (
  SELECT RAW_DATA:user_id::string uid, DATE(MIN(RAW_DATA:created_at::timestamp)) d
  FROM ${DB}.BABECHAT.USERS GROUP BY 1
)
SELECT TO_CHAR(s.d, 'YYYY-MM-DD') dt, f.code, COUNT(DISTINCT s.uid) signups
FROM first_touch f JOIN signups s ON s.uid = f.uid
WHERE s.d BETWEEN '${from}' AND '${to}'
GROUP BY 1, 2 ORDER BY 1, 2`;

console.log(`[extract] ${from} ~ ${to} 가입 집계 중 (first-touch 귀속)…`);
let rows = [];
try {
  rows = await q(sql);
} catch (e) {
  console.error('[extract] 쿼리 실패:', e.message);
  console.error('필드명 문제라면 inspect 결과를 보고 스크립트 상단 TS_FIELDS/UID_FIELDS를 조정하세요.');
  done(1);
}

if (rows.length === 0) {
  console.log('[extract] 해당 기간에 BL- 코드로 귀속된 가입이 없습니다. CSV를 만들지 않습니다.');
  done();
}

const header = 'date,platform,tracking_code,impressions,clicks,installs,signups,first_messages,cost,currency';
const lines = rows.map((r) => `${r.DT},${platform},${r.CODE},,,,${r.SIGNUPS},,,TWD`);
const csv = [header, ...lines].join('\n') + '\n';

console.log(`[extract] ${rows.length}행 (소재 ${new Set(rows.map((r) => r.CODE)).size}종):`);
for (const r of rows.slice(0, 10)) console.log(`  ${r.DT}  ${r.CODE}  가입 ${r.SIGNUPS}`);
if (rows.length > 10) console.log(`  … 외 ${rows.length - 10}행`);
console.log('※ 노출·클릭·비용은 광고 플랫폼 리포트에서 별도 CSV로 보완하세요 (같은 추적코드면 병합 저장됩니다).');

const out = typeof flag('out') === 'string' ? flag('out') : path.join(ROOT, `perf-snowflake-${from}_${to}.csv`);
fs.writeFileSync(out, csv);
console.log(`[extract] CSV 저장: ${out}`);

// ---- 선택: BabeLoop에 바로 업로드 ----
if (has('upload')) {
  const BASE = process.env.BABELOOP_URL ?? 'http://localhost:16000';
  const EMAIL = process.env.BABELOOP_EMAIL ?? 'admin@babeloop.local';
  const PASSWORD = process.env.BABELOOP_PASSWORD ?? 'changeme-admin';
  const gql = async (query, variables, cookie) => {
    const response = await fetch(`${BASE}/graphql`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ query, variables }),
    });
    const setCookie = response.headers.get('set-cookie');
    const body = await response.json();
    if (body.errors) throw new Error(body.errors.map((e) => e.message).join('; '));
    return { data: body.data, cookie: setCookie?.split(';')[0] ?? cookie };
  };
  const login = await gql('mutation($e:String!,$p:String!){login(email:$e,password:$p){id}}', { e: EMAIL, p: PASSWORD });
  const result = await gql(
    'mutation($input:ImportPerformanceCsvInput!){importPerformanceCsv(input:$input){importedRows updatedRows errorRows errors unmatchedTrackingCodes duplicateFile}}',
    { input: { fileBase64: Buffer.from(csv).toString('base64'), filename: path.basename(out) } },
    login.cookie,
  );
  const r = result.data.importPerformanceCsv;
  if (r.duplicateFile) {
    console.log(`[upload] 같은 파일이 이미 임포트되어 있습니다 (내용 동일 — 건너뜀)`);
  } else {
    console.log(`[upload] ${BASE} 임포트 완료 — 신규 ${r.importedRows}행, 갱신 ${r.updatedRows}행, 오류 ${r.errorRows}행`);
  }
  if (r.unmatchedTrackingCodes?.length) console.log('  매칭 안 된 추적코드:', r.unmatchedTrackingCodes.join(', '));
  if (r.errors?.length) for (const err of r.errors.slice(0, 5)) console.log('  -', err);
}

done();
