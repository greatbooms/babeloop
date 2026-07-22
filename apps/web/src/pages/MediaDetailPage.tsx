import { useLazyQuery, useMutation, useQuery } from '@apollo/client';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import { graphql } from '../generated';
import { JobStatus, MediaAssetKind } from '../generated/graphql';
import { useJobPolling } from '../hooks/useJobPolling';
import './source-ads.css';
import './media.css';

const MediaDetailDocument = graphql(`query MediaDetail($id: ID!) { mediaAsset(id: $id) { id status kind originalFilename createdAt mediaUrl thumbnailUrl ocrResults { id text } transcriptions { id text language } insights { id summary hookType targetAudience emotionalTriggers genres provider model promptVersion createdAt } } }`);
const ProcessMediaDocument = graphql(`mutation DetailProcessMedia($mediaAssetId: ID!) { processMediaAsset(mediaAssetId: $mediaAssetId) { id status } }`);
const AnalyzeMediaDocument = graphql(`mutation AnalyzeMediaAsset($mediaAssetId: ID!) { analyzeMediaAsset(mediaAssetId: $mediaAssetId) { id status } }`);
const SimilarMediaAdsDocument = graphql(`query SimilarAdsForMedia($mediaAssetId: ID!, $limit: Int!) { similarAdsForMediaAsset(mediaAssetId: $mediaAssetId, limit: $limit) { similarity sourceAd { id title } } }`);

function dateLabel(value: unknown) {
  return value ? new Intl.DateTimeFormat('ko-KR').format(new Date(String(value))) : '';
}

export function MediaDetailPage() {
  const { id } = useParams<{ id: string }>();
  // 업로드 직후 목록에서 넘어오면 처리 잡이 이 페이지 밖에서 끝난다 — 3초 폴링으로 추출·인사이트 결과를 따라잡는다 (미디어 URL은 fixedMediaUrl로 고정)
  const { data, refetch } = useQuery(MediaDetailDocument, { variables: { id: id! }, skip: !id, pollInterval: 3000 });
  const [processMedia] = useMutation(ProcessMediaDocument);
  const [analyzeMedia] = useMutation(AnalyzeMediaDocument);
  const [loadSimilar, similar] = useLazyQuery(SimilarMediaAdsDocument);
  const [similarOpen, setSimilarOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [fixedMediaUrl, setFixedMediaUrl] = useState<string | null>(null);
  const job = useJobPolling(jobId);
  useEffect(() => { if (!fixedMediaUrl && data?.mediaAsset.mediaUrl) setFixedMediaUrl(data.mediaAsset.mediaUrl); }, [data?.mediaAsset.mediaUrl, fixedMediaUrl]);
  useEffect(() => { if (job?.status === JobStatus.Succeeded || job?.status === JobStatus.Failed) { void refetch(); setJobId(null); } }, [job?.status, refetch]);
  const asset = data?.mediaAsset;
  if (!asset) return <section><p className="muted">미디어를 불러오는 중…</p></section>;

  async function run(action: () => Promise<string | null>) {
    setError(null);
    try { setJobId(await action()); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

  const kindLabel = asset.kind === MediaAssetKind.Video ? '영상' : '이미지';
  const hasText = asset.ocrResults.length > 0 || asset.transcriptions.length > 0;
  const hasInsight = asset.insights.length > 0;
  return <section className="stage-prep ad-detail">
    <Link className="back-link" to="/media">← 미디어 목록</Link>
    <header className="page-header">
      <div>
        <div className="page-header-title-row"><h1>{asset.originalFilename}</h1><StatusBadge status={asset.status} /></div>
        <p>{kindLabel} · {dateLabel(asset.createdAt)} 업로드 · 인사이트 {asset.insights.length}개</p>
      </div>
      <div className="page-header-actions">
        <span className="action-step">
          <span className={`action-step-num${hasText ? ' done' : ''}`} aria-hidden="true">{hasText ? '✓' : '1'}</span>
          <Button data-hint="1단계 — 이미지 글자·영상 음성을 텍스트로 추출합니다 (AI, 건당 1~2센트)" size="sm" variant={!hasText ? 'primary' : undefined} onClick={() => { if (hasText && !window.confirm('이미 추출된 텍스트가 있습니다. 다시 실행하면 기존 결과를 새 결과로 교체하며 약 1~2센트가 발생합니다. 계속할까요?')) return; void run(async () => (await processMedia({ variables: { mediaAssetId: asset.id } })).data!.processMediaAsset.id); }}>미디어 텍스트 추출</Button>
        </span>
        <span className="action-step">
          <span className={`action-step-num${hasInsight ? ' done' : ''}`} aria-hidden="true">{hasInsight ? '✓' : '2'}</span>
          <Button data-hint="2단계 — 추출된 텍스트로 자체 인사이트를 분석합니다 (AI, 약 1센트) · 텍스트 추출 후 실행" size="sm" variant={hasText && !hasInsight ? 'primary' : undefined} onClick={() => { if (hasInsight && !window.confirm('이미 인사이트가 있습니다. 다시 실행하면 새 인사이트가 추가되며 약 1센트가 발생합니다. 계속할까요?')) return; void run(async () => (await analyzeMedia({ variables: { mediaAssetId: asset.id } })).data!.analyzeMediaAsset.id); }}>인사이트 분석</Button>
        </span>
        <div className="action-utils">
          <Button data-hint="비슷한 경쟁 광고를 검색합니다 (무료, 순서 무관) · 인사이트 분석 후 사용 가능 — 결과에서 광고로 넘어가 브리프를 만들 수 있습니다" size="sm" onClick={() => { void run(async () => { await loadSimilar({ variables: { mediaAssetId: asset.id, limit: 5 } }); setSimilarOpen(true); return null; }); }}>유사 광고</Button>
        </div>
      </div>
    </header>
    <p className="action-flow-hint">진행 순서: ① 미디어 텍스트 추출 → ② 인사이트 분석. 완료된 단계는 ✓, 다음에 누를 버튼은 붉게 표시됩니다. 유사 광고는 순서와 무관한 보조 도구입니다.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {job && job.status !== JobStatus.Succeeded && job.status !== JobStatus.Failed && <p>처리 중… ({job.status})</p>}
    {fixedMediaUrl && (
      <Card className="card-stack">
        <h2>미디어</h2>
        <div className="detail-media">
          {asset.kind === MediaAssetKind.Video ? <video controls src={fixedMediaUrl} /> : <img src={fixedMediaUrl} alt={asset.originalFilename} />}
          <a href={fixedMediaUrl} download>원본 다운로드</a>
        </div>
      </Card>
    )}
    <Card className="card-stack">
      <h2>추출 텍스트</h2>
      {asset.ocrResults.length === 0 && asset.transcriptions.length === 0 && <p className="muted">추출된 텍스트가 없습니다. 「미디어 텍스트 추출」을 실행해주세요.</p>}
      {asset.ocrResults.map((item) => <div key={item.id}><h3>OCR</h3><p className="long-copy">{item.text}</p></div>)}
      {asset.transcriptions.map((item) => <div key={item.id}><h3>전사{item.language ? ` (${item.language})` : ''}</h3><p className="long-copy">{item.text}</p></div>)}
    </Card>
    <Card className="card-stack">
      <h2>인사이트</h2>
      {asset.insights.length === 0 && <p className="muted">아직 인사이트가 없습니다. 텍스트 추출 후 「인사이트 분석」을 실행해주세요.</p>}
      {asset.insights.map((insight) => (
        <div className="insight-block" key={insight.id}>
          <p className="insight-summary">{insight.summary}</p>
          <div className="insight-facet"><span className="facet-label">훅</span><div className="tag-row"><span className="tag tag-accent">{insight.hookType}</span></div></div>
          <div className="insight-facet"><span className="facet-label">타깃</span><div className="tag-row">{insight.targetAudience.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div></div>
          <div className="insight-facet"><span className="facet-label">감정</span><div className="tag-row">{insight.emotionalTriggers.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div></div>
          <div className="insight-facet"><span className="facet-label">장르</span><div className="tag-row">{insight.genres.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div></div>
          <p className="ai-meta">{dateLabel(insight.createdAt)} · {insight.provider} · {insight.model} · {insight.promptVersion}</p>
        </div>
      ))}
    </Card>
    {similar.loading && <p>검색 중…</p>}
    <Modal title="유사 경쟁 광고" open={similarOpen && Boolean(similar.data)} onClose={() => setSimilarOpen(false)}>
      <p className="muted">이 미디어와 메시지가 가까운 순서입니다. 항목을 누르면 해당 광고 상세로 이동합니다.</p>
      {similar.data?.similarAdsForMediaAsset.length === 0 && <p className="muted">유사한 광고를 찾지 못했습니다. (분석된 광고가 많아질수록 결과가 풍부해집니다)</p>}
      <ul className="similar-list">
        {similar.data?.similarAdsForMediaAsset.map((hit) => (
          <li className="similar-row" key={hit.sourceAd.id}>
            <span className="sim-chip">유사도 {hit.similarity.toFixed(2)}</span>
            <Link to={`/ads/${hit.sourceAd.id}`} onClick={() => setSimilarOpen(false)}>{hit.sourceAd.title ?? hit.sourceAd.id}</Link>
          </li>
        ))}
      </ul>
    </Modal>
  </section>;
}
