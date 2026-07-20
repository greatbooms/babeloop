# BabeLoop UI 2차 개선 계획 — 이해 가능성·관계 가시화·영상 썸네일

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자 피드백 8건 반영 — ①자세한 사용법 패널 ②브랜드 페이지 완성(기능·가이드라인 UI) ③"브리프" 용어 설명 ④미디어 활용처 표시 ⑤광고↔브리프 관계 가시화 ⑥광고 미디어 보기·다운로드 ⑦버튼 호버 설명 ⑧단계별 색감 + **영상 썸네일 생성(FFmpeg)**.

**불변 제약:** 이전 계획들과 동일 — E2E 접근성 계약 보존(기존 라벨·버튼명·h1·li·배지 영문 enum 절대 불변, 신규 요소는 자유), 디자인 토큰 준수(신규 색은 이 계획이 정의하는 단계 팔레트만 추가), AI 호출 0, git 금지, wait 루프 금지. 합격선: `pnpm e2e` 6종 통과.

---

## Task 1: 영상 썸네일 (FFmpeg) — 서버

**Files:**
- Modify: `prisma/schema.prisma` (MediaAsset에 `thumbnailKey String?`), `apps/server/package.json`(+`ffmpeg-static`), `apps/server/src/queues/media-processing.processor.ts`, `apps/server/src/common/storage/storage.service.ts`(변경 불필요 시 생략), `apps/server/src/modules/source-ad/source-ad.service.ts`(썸네일 URL 로직), `apps/server/src/modules/media/media.service.ts`
- Create: `apps/server/src/common/media/video-thumbnail.ts` (+spec — ffmpeg 호출은 주입 가능한 러너로 감싸 단위 테스트)

- [ ] `pnpm --filter @babeloop/server add ffmpeg-static` (불가 시 package.json 직접 추가 `"ffmpeg-static": "^5.2.0"`)
- [ ] `video-thumbnail.ts`:
```typescript
import { execFile } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

/** 영상 버퍼에서 1초 지점 프레임을 JPEG로 추출한다. ffmpeg-static 바이너리 사용, AI 비용 0. */
export async function extractVideoThumbnail(buffer: Buffer): Promise<Buffer> {
  const ffmpegPath = (require('ffmpeg-static') as string | null);
  if (!ffmpegPath) throw new Error('ffmpeg 바이너리를 찾을 수 없습니다');
  const dir = await mkdtemp(join(tmpdir(), 'babeloop-thumb-'));
  try {
    const input = join(dir, 'input');
    const output = join(dir, 'thumb.jpg');
    await writeFile(input, buffer);
    await new Promise<void>((resolve, reject) => {
      execFile(ffmpegPath, ['-ss', '1', '-i', input, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', output, '-y'],
        { timeout: 30_000 }, (error) => (error ? reject(error) : resolve()));
    });
    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
```
(spec: execFile을 주입 가능하게 하거나, 통합에서만 검증하고 단위는 인자 구성 검증 — 기존 openai provider 테스트 스타일)
- [ ] 스키마: `thumbnailKey String?` 추가 → 마이그레이션 `pnpm prisma migrate dev --name video-thumbnails` (샌드박스 불가 시 스키마만)
- [ ] `media-processing.processor.ts`: `downloadExternalMedia`에서 VIDEO 저장 후 썸네일 추출 → `storage.putBuffer(`${storageKey}.thumb.jpg`, thumb, 'image/jpeg')` → asset.thumbnailKey 저장. **실패해도 다운로드 자체는 성공 처리** (try/catch — 썸네일은 부가물). `processMedia`(수동 재처리)에서도 VIDEO이고 thumbnailKey 없으면 생성.
- [ ] 썸네일 URL 통일: `mapSourceAdWithThumbnail` → IMAGE는 원본 presign, VIDEO는 `thumbnailKey` 있으면 presign. `MediaAssetModel.thumbnailUrl` 로직 갱신.
- [ ] **백필 mutation**: `generateVideoThumbnails`(ADMIN) — thumbnailKey 없는 VIDEO 자산 전체에 기존 `PROCESS_MEDIA` 잡 등록... 주의: processMedia는 STT도 실행한다(실 API 비용!). **분리 필수**: 새 잡 타입 `GENERATE_THUMBNAIL`(`generate-thumbnail--{assetId}`, media-processing 큐)로 썸네일만 생성. mutation은 `{ enqueued: Int }` 반환.

## Task 2: 관계 가시화 — 서버

**Files:**
- Modify: `apps/server/src/modules/generation/brief.models.ts`·`brief.service.ts` (브리프에 `referencedAds: [AdRefModel]` — sourceAdIds→{id,title} 매핑), `source-ad.models.ts`·`source-ad.service.ts` (광고에 `referencingBriefs: [BriefRefModel]` — `creativeBrief.findMany({ where: { sourceAdIds: { has: id } }, select: {id, title} })`, findPage 항목에 포함), `media.models.ts`·`media.service.ts` (자산에 `linkedSourceAds: [AdRefModel]`), `MediaAssetModel`에 `mediaUrl: String` (모든 kind 원본 presign — 보기·다운로드용)
- 브리프 생성 input에 brandId는 이미 있음 — 그대로 노출만 (Task 5 웹)

성능 주의: findPage 24건 × referencingBriefs 쿼리 → briefs 전체를 한 번 조회해 메모리 매핑 (브리프 수십 건 규모 — N+1 회피).

## Task 3: 브랜드 관리 — 서버

**Files:**
- Modify: `apps/server/src/modules/brand/` — mutations 추가: `updateBrand`(이미 있음 — description 포함 확인), `addBrandFeature(brandId, name, description)`, `deleteBrandFeature(id)`, `addBrandGuideline(brandId, title, content)`, `deleteBrandGuideline(id)` (Roles ADMIN/EDITOR/REVIEWER)
- **generate-schema.ts 갱신 불필요 확인** (BrandResolver 이미 등록)

## Task 4: 도움말 시스템 — 웹

**Files:**
- Create: `apps/web/src/components/HelpPanel.tsx`, `apps/web/src/lib/page-guides.tsx`, `InfoTip` 스타일(components.css)

- **HelpPanel**: PageHeader 아래 접이식(`<details>`) "📖 이 화면 자세한 사용법" — 내용은 `page-guides.tsx`에 페이지별 정의: (a) 이 화면의 역할 2~3문장 (b) 사용 순서 번호 목록 (c) **버튼별 설명 표** (d) 용어 설명. 예: 광고 페이지 버튼 표 — 미디어 텍스트 추출="이미지 글자·영상 음성을 텍스트로 추출 (AI, 건당 1~2센트)", 광고 분석="추출된 텍스트로 훅·타깃·감정 분류 (AI, ~1센트)", 재다운로드="원본 미디어 다시 받기 (무료)", 유사 광고="비슷한 메시지의 광고 검색 (무료)". **비용이 드는 버튼은 표에 명시.**
- 용어집(공통 섹션): 브리프="광고 기획서 — 누구에게(타깃), 어떤 메시지(훅·CTA)를, 어떤 형식으로 낼지 AI가 정리한 문서", 훅="광고 첫 1~2초에 시선을 잡는 장치", 추적코드="내보낸 소재마다 붙는 고유 코드(BL-…). 광고 성과를 소재별로 연결하는 열쇠", 현지화 검수="AI 번체중문 초안을 대만 원어민 감각으로 다듬는 단계", 정책 검사="금지어·경쟁사 표절·미성년 신호 자동 점검".
- **InfoTip**: `<span class="info-tip" data-hint="...">?</span>` 소형 원형 — 주요 폼 필드 옆 (예: 포커스 필드="만들고 싶은 광고의 방향을 한 문장으로. 이 문장과 비슷한 경쟁 광고를 자동으로 찾아 참고합니다").
- 기존 nav 툴팁 CSS(`data-hint`) 재사용.

## Task 5: 페이지 개선 — 웹

- **브랜드**: 브랜드 카드 확장 — 소개 편집(textarea+저장), 기능 목록(이름·설명 추가/삭제), 가이드라인(제목·내용 추가/삭제). 상단 흐름 안내: "여기 내용은 → 브리프 생성 시 AI 프롬프트의 「우리 제품」 섹션으로 들어갑니다". HelpPanel에 데이터 흐름 설명.
- **브리프**: 제목 옆 InfoTip("브리프란?"), **브랜드 선택 셀렉트**(label "브랜드", 옵션: 선택 안 함/브랜드 목록 — generateCreativeBrief input.brandId 연결), 카드에 **"참조한 경쟁 광고 N건"** 접이식 목록(제목 표시). 변형에는 이미 zh-TW 표시됨.
- **광고**: 카드 썸네일 클릭 → 카드 아래 인라인 확장 뷰어: IMAGE=원본 이미지(`mediaUrl`), VIDEO=`<video controls src={mediaUrl}>` + "원본 다운로드" 링크(`<a href={mediaUrl} download>`). "이 광고를 참조한 브리프" 목록(있을 때만). 버튼 4개에 data-hint. 영상 카드 썸네일: thumbnailUrl 있으면 이미지(재생 아이콘 오버레이 ▶), 없으면 기존 "영상" 플레이스홀더.
- **미디어**: 자산 카드에 연결 광고 표시("광고 「제목」에 연결됨" 링크) + 썸네일(mediaUrl/thumbnailUrl) 표시.
- **버튼 힌트 전 페이지 일괄**: 검토(정책 검사·검토 요청·현지화 승인·최종 승인·수정 요청·거절·실험에 추가), 실험(내보내기), 성과(성과 업로드·이 성과로 브리프 생성), 브리프(브리프 생성·문구 변형 3개 생성).

## Task 6: 단계별 색감 — 웹

**Files:** `tokens.css`, `components.css`, `home.css`, 각 페이지

- 토큰 추가 (soft bg + strong fg 페어 — Airbnb sub-brand accent 개념의 확장):
```css
--step-collect-bg:#fff0f3; --step-collect-fg:#e00b41;  /* 수집·분석 — Rausch 계열 */
--step-create-bg:#f3efff;  --step-create-fg:#5b3df5;   /* 생성 */
--step-review-bg:#e9f7f5;  --step-review-fg:#0f766e;   /* 검토 */
--step-export-bg:#eef4ff;  --step-export-fg:#1d4ed8;   /* 내보내기 */
--step-perf-bg:#e8f6ea;    --step-perf-fg:#1d7a2c;     /* 성과 */
--step-prep-bg:#fff7e8;    --step-prep-fg:#b45309;     /* 준비(브랜드·미디어) */
```
- 적용: 홈 6카드(단계 번호·상단 보더 4px 단계색, hover lift), 각 페이지 step-chip(해당 단계색), PageHeader 좌측 4px 단계색 보더, HelpPanel 아이콘도 단계색. 카드 hover에 `--shadow-float` + translateY(-2px). 로그인 페이지: 위쪽에 은은한 Rausch 톤 그라디언트 밴드.
- 절제 유지: 본문·버튼·배지는 기존 그대로 — 색은 "여기가 어느 단계인가"를 말할 때만.

## Task 7: 검증

- [ ] 전체 서버 테스트 + `pnpm build` + `pnpm e2e` 6종 (합격선)
- [ ] (Claude) 마이그레이션 + 썸네일 백필 실행(영상 359건) + **9개 페이지 전수 브라우저 확인** (login·home·brands·media·ads·briefs·review·experiments·performance) + 영상 재생·다운로드 실제 클릭 확인
