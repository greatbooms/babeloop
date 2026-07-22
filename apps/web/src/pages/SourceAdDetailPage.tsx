import { useLazyQuery, useMutation, useQuery } from '@apollo/client';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FormField } from '../components/FormField';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import { graphql } from '../generated';
import { MediaAssetKind } from '../generated/graphql';
import { useJobPolling } from '../hooks/useJobPolling';
import './source-ads.css';

const SourceAdDocument = graphql(`
  query SourceAdDetail($id: ID!) {
    sourceAd(id: $id) {
      id status title adText origin sourceUrl networks countries firstSeenAt lastSeenAt provider confidence
      competitor { id name }
      mediaAsset { id kind mediaUrl ocrResults { id text } transcriptions { id text language } }
      latestAnalysis { id summary hookType targetAudience emotionalTriggers genres }
      referencingBriefs { id title }
    }
  }
`);
const SimilarDocument = graphql(`query Similar($input: SimilarSourceAdsInput!) { similarSourceAds(input: $input) { similarity sourceAd { id title adText } } }`);
const ProcessMediaAssetDocument = graphql(`mutation ProcessMediaAsset($mediaAssetId: ID!) { processMediaAsset(mediaAssetId: $mediaAssetId) { id status } }`);
const AnalyzeSourceAdDocument = graphql(`mutation AnalyzeSourceAd($input: AnalyzeSourceAdInput!) { analyzeSourceAd(input: $input) { id status } }`);
const RedownloadMediaDocument = graphql(`mutation RedownloadSourceAdMedia($sourceAdId: ID!) { redownloadSourceAdMedia(sourceAdId: $sourceAdId) { id status } }`);
const AdDetailBrandsDocument = graphql(`query AdDetailBrands { brands { id name } }`);
const GenerateBriefFromAdDocument = graphql(`mutation GenerateBriefFromAd($input: GenerateCreativeBriefInput!) { generateCreativeBrief(input: $input) { job { id status } } }`);

function dateLabel(value: unknown) {
  return value ? new Intl.DateTimeFormat('ko-KR').format(new Date(String(value))) : '날짜 없음';
}

export function SourceAdDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, refetch } = useQuery(SourceAdDocument, { variables: { id: id! }, skip: !id, pollInterval: 3000 });
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const job = useJobPolling(jobId);
  const [processMediaAsset] = useMutation(ProcessMediaAssetDocument);
  const [analyzeSourceAd] = useMutation(AnalyzeSourceAdDocument);
  const [redownloadMedia] = useMutation(RedownloadMediaDocument);
  const [loadSimilar, similarQuery] = useLazyQuery(SimilarDocument);
  const [similarOpen, setSimilarOpen] = useState(false);
  const navigate = useNavigate();
  const brandsQuery = useQuery(AdDetailBrandsDocument);
  const [generateBrief] = useMutation(GenerateBriefFromAdDocument);
  const [briefModalOpen, setBriefModalOpen] = useState(false);
  const [briefTitle, setBriefTitle] = useState('');
  const [briefBrandId, setBriefBrandId] = useState('');
  const [briefFocus, setBriefFocus] = useState('');
  const [briefJobId, setBriefJobId] = useState<string | null>(null);
  const briefJob = useJobPolling(briefJobId);
  const ad = data?.sourceAd;

  // 유사 광고 링크로 /ads/A → /ads/B 이동 시 같은 컴포넌트가 재사용된다 — 이전 광고의 고정 URL·잡·에러가 남지 않게 리셋
  useEffect(() => {
    setMediaUrl(null);
    setJobId(null);
    setError(null);
    setSimilarOpen(false);
    setBriefModalOpen(false);
    setBriefJobId(null);
  }, [id]);
  useEffect(() => {
    // ad가 아직 이전 광고 데이터일 수 있으므로 라우트 id와 일치할 때만 고정한다
    if (!mediaUrl && ad && ad.id === id && ad.mediaAsset?.mediaUrl) setMediaUrl(ad.mediaAsset.mediaUrl);
  }, [ad, id, mediaUrl]);
  useEffect(() => {
    if (job?.status === 'SUCCEEDED' || job?.status === 'FAILED') void refetch();
  }, [job?.status, refetch]);
  // 브리프 생성이 끝나면 새 브리프 상세로 이동한다
  useEffect(() => {
    if (briefJob?.status === 'SUCCEEDED') {
      const briefId = briefJob.resultJson ? (JSON.parse(briefJob.resultJson) as { briefId?: string }).briefId : undefined;
      navigate(briefId ? `/briefs/${briefId}` : '/briefs');
    }
    if (briefJob?.status === 'FAILED') setError(briefJob.error ?? '브리프 생성에 실패했습니다');
  }, [briefJob?.status, briefJob?.resultJson, briefJob?.error, navigate]);

  async function run(action: () => Promise<string | null>) {
    setError(null);
    try { setJobId(await action()); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

  async function onSimilar() {
    setError(null);
    try {
      await loadSimilar({ variables: { input: { sourceAdId: id!, limit: 5 } } });
      setSimilarOpen(true);
    } catch (cause) {
      const code = (cause as { graphQLErrors?: Array<{ extensions?: { code?: string } }> }).graphQLErrors?.[0]?.extensions?.code;
      setError(code === 'EMBEDDING_NOT_READY' ? '분석이 끝나면 검색할 수 있습니다' : cause instanceof Error ? cause.message : String(cause));
    }
  }

  if (!ad) return <section><p className="muted">광고를 불러오는 중…</p></section>;
  const hasText = Boolean(ad.adText) || (ad.mediaAsset?.ocrResults.length ?? 0) > 0 || (ad.mediaAsset?.transcriptions.length ?? 0) > 0;
  const hasAnalysis = Boolean(ad.latestAnalysis);
  const hasBrief = ad.referencingBriefs.length > 0;
  return (
    <section className="stage-collect ad-detail">
      <Link className="back-link" to="/ads">← 광고 목록</Link>
      <header className="page-header">
        <div><div className="page-header-title-row"><h1>{ad.title ?? ad.adText ?? ad.id}</h1><StatusBadge status={ad.status} /></div><p>{ad.competitor?.name ?? '광고주 정보 없음'}</p></div>
        <div className="page-header-actions detail-actions">
          <div className="action-steps">
          {ad.mediaAsset && (
            <span className="action-step">
              <span className={`action-step-num${hasText ? ' done' : ''}`} aria-hidden="true">{hasText ? '✓' : '1'}</span>
              <Button data-hint="1단계 — 이미지 글자·영상 음성을 텍스트로 추출합니다 (AI, 건당 1~2센트)" size="sm" variant={!hasText ? 'primary' : undefined} onClick={() => { if (hasText && !window.confirm('이미 추출된 텍스트가 있습니다. 다시 실행하면 기존 결과를 새 결과로 교체하며 약 1~2센트가 발생합니다. 계속할까요?')) return; void run(async () => (await processMediaAsset({ variables: { mediaAssetId: ad.mediaAsset!.id } })).data!.processMediaAsset.id); }}>미디어 텍스트 추출</Button>
            </span>
          )}
          <span className="action-step">
            <span className={`action-step-num${hasAnalysis ? ' done' : ''}`} aria-hidden="true">{hasAnalysis ? '✓' : '2'}</span>
            <Button data-hint="2단계 — 추출된 텍스트로 훅·타깃·감정을 분류합니다 (AI, 약 1센트) · 텍스트 추출 후 실행" size="sm" variant={hasText && !hasAnalysis ? 'primary' : undefined} onClick={() => { if (hasAnalysis && !window.confirm('이미 분석 결과가 있습니다. 다시 실행하면 새 분석으로 갱신되며 약 1센트가 발생합니다. 계속할까요?')) return; void run(async () => (await analyzeSourceAd({ variables: { input: { sourceAdId: ad.id } } })).data!.analyzeSourceAd.id); }}>광고 분석</Button>
          </span>
          <span className="action-step">
            <span className={`action-step-num${hasBrief ? ' done' : ''}`} aria-hidden="true">{hasBrief ? '✓' : '3'}</span>
            <Button data-hint="3단계 — 이 광고를 참조로 지정해 광고 기획서를 생성합니다 (AI, 약 1~2센트) · 분석 완료 후 실행" size="sm" variant={hasAnalysis && !hasBrief ? 'primary' : undefined} onClick={() => setBriefModalOpen(true)}>브리프 생성</Button>
          </span>
          </div>
          <div className="action-utils">
            <Button data-hint="비슷한 메시지의 광고를 검색합니다 (무료, 순서 무관) · 분석 완료 후 사용 가능" size="sm" onClick={() => void onSimilar()}>유사 광고</Button>
            {ad.sourceUrl && <Button data-hint="원본 미디어를 다시 받습니다 (무료, 순서 무관)" size="sm" onClick={() => void run(async () => (await redownloadMedia({ variables: { sourceAdId: ad.id } })).data!.redownloadSourceAdMedia.id)}>재다운로드</Button>}
          </div>
        </div>
      </header>
      <p className="action-flow-hint">진행 순서: ① 미디어 텍스트 추출 → ② 광고 분석 → ③ 브리프 생성 (이 광고를 참조한 기획서 작성). 완료된 단계는 ✓, 다음에 누를 버튼은 붉게 표시됩니다. 유사 광고·재다운로드는 순서와 무관한 보조 도구입니다.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {job && job.status !== 'SUCCEEDED' && job.status !== 'FAILED' && <p>분석 중… ({job.status})</p>}
      {briefJob && briefJob.status !== 'SUCCEEDED' && briefJob.status !== 'FAILED' && <p>브리프 생성 중… 완료되면 브리프 상세로 이동합니다 ({briefJob.status})</p>}
      <Card className="card-stack">
        <h2>미디어</h2>
        {mediaUrl && ad.mediaAsset ? <div className="detail-media">{ad.mediaAsset.kind === MediaAssetKind.Video ? <video controls src={mediaUrl} /> : <img src={mediaUrl} alt={ad.title ?? '광고 원본'} />}<a href={mediaUrl} download>원본 다운로드</a></div> : <p className="muted">등록된 미디어가 없습니다.</p>}
      </Card>
      <Card className="card-stack"><h2>메타 정보</h2><dl className="brand-dl"><div><dt>광고주</dt><dd>{ad.competitor?.name ?? '없음'}</dd></div><div><dt>네트워크·국가</dt><dd>{[...ad.networks, ...ad.countries].join(' · ') || '없음'}</dd></div><div><dt>기간</dt><dd>{dateLabel(ad.firstSeenAt)} ~ {dateLabel(ad.lastSeenAt)}</dd></div><div><dt>출처</dt><dd>{ad.origin} · {ad.provider}{ad.sourceUrl && <> · <a href={ad.sourceUrl} target="_blank" rel="noreferrer">원본 링크</a></>}</dd></div><div><dt>신뢰도</dt><dd>{ad.confidence}</dd></div></dl></Card>
      <Card className="card-stack"><h2>추출 텍스트</h2>{ad.adText && <><h3>광고 문구</h3><p className="long-copy">{ad.adText}</p></>}{ad.mediaAsset?.ocrResults.map((item) => <div key={item.id}><h3>OCR</h3><p className="long-copy">{item.text}</p></div>)}{ad.mediaAsset?.transcriptions.map((item) => <div key={item.id}><h3>전사{item.language ? ` (${item.language})` : ''}</h3><p className="long-copy">{item.text}</p></div>)}{!ad.adText && !ad.mediaAsset?.ocrResults.length && !ad.mediaAsset?.transcriptions.length && <p className="muted">추출된 텍스트가 없습니다.</p>}</Card>
      <Card className="card-stack"><h2>최신 분석 결과</h2>{ad.latestAnalysis ? <dl className="brand-dl"><div><dt>요약</dt><dd>{ad.latestAnalysis.summary}</dd></div><div><dt>훅</dt><dd>{ad.latestAnalysis.hookType}</dd></div><div><dt>타깃</dt><dd>{ad.latestAnalysis.targetAudience.join(', ')}</dd></div><div><dt>감정</dt><dd>{ad.latestAnalysis.emotionalTriggers.join(', ')}</dd></div><div><dt>장르</dt><dd>{ad.latestAnalysis.genres.join(', ')}</dd></div></dl> : <p className="muted">분석 결과가 없습니다.</p>}</Card>
      <Card className="card-stack"><h2>이 광고를 참조한 브리프</h2>{ad.referencingBriefs.length ? <ul className="compact-list">{ad.referencingBriefs.map((brief) => <li key={brief.id}><Link to={`/briefs/${brief.id}`}>{brief.title}</Link></li>)}</ul> : <p className="muted">참조한 브리프가 없습니다.</p>}</Card>
      {similarQuery.loading && <p>검색 중…</p>}
      <Modal title="유사 광고" open={similarOpen && Boolean(similarQuery.data)} onClose={() => setSimilarOpen(false)}>
        <p className="muted">이 광고와 메시지가 가까운 순서입니다. 항목을 누르면 해당 광고 상세로 이동합니다.</p>
        {similarQuery.data?.similarSourceAds.length === 0 && <p className="muted">유사한 광고를 찾지 못했습니다. (분석된 광고가 많아질수록 결과가 풍부해집니다)</p>}
        <ul className="similar-list">
          {similarQuery.data?.similarSourceAds.map((similar) => (
            <li className="similar-row" key={similar.sourceAd.id}>
              <span className="sim-chip">유사도 {similar.similarity.toFixed(2)}</span>
              <Link to={`/ads/${similar.sourceAd.id}`} onClick={() => setSimilarOpen(false)}>{similar.sourceAd.title ?? similar.sourceAd.adText ?? similar.sourceAd.id}</Link>
            </li>
          ))}
        </ul>
      </Modal>
      <Modal title="이 광고를 참조해 브리프 생성" open={briefModalOpen} onClose={() => setBriefModalOpen(false)}>
        <p className="muted">이 광고가 「직접 지정」 참조로 들어간 광고 기획서를 만듭니다. 브랜드를 고르면 제품 소개·기능이 함께 전달돼 품질이 좋아집니다. (AI, 약 1~2센트)</p>
        <FormField label="브랜드" htmlFor="ad-brief-brand"><select id="ad-brief-brand" value={briefBrandId} onChange={(event) => setBriefBrandId(event.target.value)}><option value="">선택 안 함</option>{brandsQuery.data?.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></FormField>
        <FormField label="브리프 제목 (선택)" htmlFor="ad-brief-title"><input id="ad-brief-title" value={briefTitle} onChange={(event) => setBriefTitle(event.target.value)} /></FormField>
        <FormField label="추가 포커스 (선택)" htmlFor="ad-brief-focus"><textarea id="ad-brief-focus" placeholder="원하는 방향이 있으면 한 문장으로. 비워두면 이 광고의 패턴만으로 만듭니다" value={briefFocus} onChange={(event) => setBriefFocus(event.target.value)} /></FormField>
        <Button variant="primary" onClick={() => { setBriefModalOpen(false); void run(async () => { const result = await generateBrief({ variables: { input: { sourceAdIds: [ad.id], brandId: briefBrandId || undefined, title: briefTitle || undefined, focusText: briefFocus || undefined } } }); setBriefJobId(result.data!.generateCreativeBrief.job.id); return null; }); }}>생성 시작</Button>
      </Modal>
    </section>
  );
}
