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
import { formatDate } from '../i18n/format-date';
import { useT } from '../i18n/lang-context';
import './source-ads.css';
import './media.css';

const MediaDetailDocument = graphql(`query MediaDetail($id: ID!) { mediaAsset(id: $id) { id status kind originalFilename createdAt mediaUrl thumbnailUrl ocrResults { id text } transcriptions { id text language } visualDescriptions { id text } insights { id summary hookType targetAudience emotionalTriggers genres zhTwJson provider model promptVersion createdAt } } }`);
const ProcessMediaDocument = graphql(`mutation DetailProcessMedia($mediaAssetId: ID!) { processMediaAsset(mediaAssetId: $mediaAssetId) { id status } }`);
const AnalyzeMediaDocument = graphql(`mutation AnalyzeMediaAsset($mediaAssetId: ID!) { analyzeMediaAsset(mediaAssetId: $mediaAssetId) { id status } }`);
const SimilarMediaAdsDocument = graphql(`query SimilarAdsForMedia($mediaAssetId: ID!, $limit: Int!) { similarAdsForMediaAsset(mediaAssetId: $mediaAssetId, limit: $limit) { similarity sourceAd { id title } } }`);

export function MediaDetailPage() {
  const { lang, t } = useT();
  const { id } = useParams<{ id: string }>();
  // 업로드 직후 목록에서 넘어오면 처리 잡이 이 페이지 밖에서 끝난다 — 3초 폴링으로 추출·인사이트 결과를 따라잡는다 (미디어 URL은 fixedMediaUrl로 고정)
  const [pollFast, setPollFast] = useState(true);
  // cache-and-network: 목록 폴링이 캐시에 심은 최신 상태와 상세 전용 필드(추출 텍스트 등)가 어긋날 수 있어 진입 시 반드시 네트워크로 확인한다
  const { data, refetch } = useQuery(MediaDetailDocument, { variables: { id: id! }, skip: !id, pollInterval: pollFast ? 3000 : 30_000, fetchPolicy: 'cache-and-network', nextFetchPolicy: 'cache-first' });
  const [processMedia] = useMutation(ProcessMediaDocument);
  const [analyzeMedia] = useMutation(AnalyzeMediaDocument);
  const [loadSimilar, similar] = useLazyQuery(SimilarMediaAdsDocument);
  const [similarOpen, setSimilarOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [fixedMediaUrl, setFixedMediaUrl] = useState<string | null>(null);
  const job = useJobPolling(jobId);
  useEffect(() => {
    const assetStatus = data?.mediaAsset?.status;
    setPollFast(Boolean(jobId) || assetStatus === 'PENDING' || assetStatus === 'UPLOADED' || assetStatus === 'PROCESSING');
  }, [data, jobId]);
  useEffect(() => { if (!fixedMediaUrl && data?.mediaAsset.mediaUrl) setFixedMediaUrl(data.mediaAsset.mediaUrl); }, [data?.mediaAsset.mediaUrl, fixedMediaUrl]);
  useEffect(() => { if (job?.status === JobStatus.Succeeded || job?.status === JobStatus.Failed) { void refetch(); setJobId(null); } }, [job?.status, refetch]);
  const asset = data?.mediaAsset;
  if (!asset) return <section><p className="muted">{t('media.loading')}</p></section>;

  async function run(action: () => Promise<string | null>) {
    setError(null);
    try { setJobId(await action()); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

  const kindLabel = asset.kind === MediaAssetKind.Video ? t('media.video') : t('media.image');
  const hasText = asset.ocrResults.length > 0 || asset.transcriptions.length > 0 || asset.visualDescriptions.length > 0;
  const hasInsight = asset.insights.length > 0;
  return <section className="stage-prep ad-detail">
    <Link className="back-link" to="/media">{t('media.back')}</Link>
    <header className="page-header">
      <div>
        <div className="page-header-title-row"><h1>{asset.originalFilename}</h1><StatusBadge status={asset.status} /></div>
        <p>{t('media.detailMeta', { kind: kindLabel, date: formatDate(String(asset.createdAt), lang), count: asset.insights.length })}</p>
      </div>
      <div className={`page-header-actions detail-actions${job && job.status !== JobStatus.Succeeded && job.status !== JobStatus.Failed ? ' actions-locked' : ''}`}>
        <div className="action-steps">
        <span className="action-step">
          <span className={`action-step-num${hasText ? ' done' : ''}`} aria-hidden="true">{hasText ? '✓' : '1'}</span>
          <Button data-hint={t('media.extractHint')} size="sm" variant={!hasText ? 'primary' : undefined} onClick={() => { if (hasText && !window.confirm(t('media.extractConfirm'))) return; void run(async () => (await processMedia({ variables: { mediaAssetId: asset.id } })).data!.processMediaAsset.id); }}>{t('media.extract')}</Button>
        </span>
        <span className="action-step">
          <span className={`action-step-num${hasInsight ? ' done' : ''}`} aria-hidden="true">{hasInsight ? '✓' : '2'}</span>
          <Button data-hint={t('media.analyzeHint')} size="sm" variant={hasText && !hasInsight ? 'primary' : undefined} onClick={() => { if (hasInsight && !window.confirm(t('media.analyzeConfirm'))) return; void run(async () => (await analyzeMedia({ variables: { mediaAssetId: asset.id } })).data!.analyzeMediaAsset.id); }}>{t('media.analyze')}</Button>
        </span>
        </div>
        <div className="action-utils">
          <Button data-hint={t('media.similarHint')} size="sm" onClick={() => { void run(async () => { await loadSimilar({ variables: { mediaAssetId: asset.id, limit: 5 } }); setSimilarOpen(true); return null; }); }}>{t('media.similarAds')}</Button>
        </div>
      </div>
    </header>
    <p className="action-flow-hint">{t('media.flow')}</p>
    {error && <p className="error" role="alert">{error}</p>}
    {job && job.status !== JobStatus.Succeeded && job.status !== JobStatus.Failed && (
      <div className="job-banner" role="status"><span className="job-banner-spinner" aria-hidden="true" /><span>{t('ads.jobBanner', { status: job.status })}</span></div>
    )}
    {job?.status === JobStatus.Failed && <p className="error" role="alert">{t('ads.jobFailed', { error: job.error ?? '' })}</p>}
    {fixedMediaUrl && (
      <Card className="card-stack">
        <h2>{t('media.media')}</h2>
        <div className="detail-media">
          {asset.kind === MediaAssetKind.Video ? <video controls src={fixedMediaUrl} /> : <img src={fixedMediaUrl} alt={asset.originalFilename} />}
          <a href={fixedMediaUrl} download>{t('common.originalDownload')}</a>
        </div>
      </Card>
    )}
    <Card className="card-stack">
      <h2>{t('media.extractedText')}</h2>
      {asset.ocrResults.length === 0 && asset.transcriptions.length === 0 && asset.visualDescriptions.length === 0 && <p className="muted">{t('media.noExtractedText')}</p>}
      {asset.ocrResults.map((item) => <div key={item.id}><h3>OCR</h3><p className="long-copy">{item.text}</p></div>)}
      {asset.transcriptions.map((item) => <div key={item.id}><h3>{t('media.transcription')}{item.language ? ` (${item.language})` : ''}</h3><p className="long-copy">{item.text}</p></div>)}
      {asset.visualDescriptions.map((item) => <div key={item.id}><h3>{t('media.visualDescription')}</h3><p className="long-copy">{item.text}</p></div>)}
    </Card>
    <Card className="card-stack">
      <h2>{t('media.insights')}</h2>
      {asset.insights.length === 0 && <p className="muted">{t('media.noInsights')}</p>}
      {asset.insights.map((insight) => (
        <div className="insight-block" key={insight.id}>
          {(() => {
            type InsightFields = { summary: string; hookType: string; targetAudience: string[]; emotionalTriggers: string[]; genres: string[] };
            const zhTw = insight.zhTwJson ? JSON.parse(insight.zhTwJson) as InsightFields : null;
            const fields: InsightFields = lang === 'zhTw' && zhTw ? zhTw : insight;
            return <>{lang === 'zhTw' && !zhTw && <p className="muted">{t('media.noZhInsight')}</p>}<p className="insight-summary">{fields.summary}</p>
              <div className="insight-facet"><span className="facet-label">{t('media.hook')}</span><div className="tag-row"><span className="tag tag-accent">{fields.hookType}</span></div></div>
              <div className="insight-facet"><span className="facet-label">{t('media.target')}</span><div className="tag-row">{fields.targetAudience.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div></div>
              <div className="insight-facet"><span className="facet-label">{t('media.emotion')}</span><div className="tag-row">{fields.emotionalTriggers.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div></div>
              <div className="insight-facet"><span className="facet-label">{t('media.genre')}</span><div className="tag-row">{fields.genres.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div></div></>;
          })()}
          <p className="ai-meta">{formatDate(String(insight.createdAt), lang)} · {insight.provider} · {insight.model} · {insight.promptVersion}</p>
        </div>
      ))}
    </Card>
    {similar.loading && <p>{t('common.search')}</p>}
    <Modal title={t('media.similarCompetitorAds')} open={similarOpen && Boolean(similar.data)} onClose={() => setSimilarOpen(false)}>
      <p className="muted">{t('media.similarDescription')}</p>
      {similar.data?.similarAdsForMediaAsset.length === 0 && <p className="muted">{t('media.noSimilar')}</p>}
      <ul className="similar-list">
        {similar.data?.similarAdsForMediaAsset.map((hit) => (
          <li className="similar-row" key={hit.sourceAd.id}>
            <span className="sim-chip">{t('media.similarity', { value: hit.similarity.toFixed(2) })}</span>
            <Link to={`/ads/${hit.sourceAd.id}`} onClick={() => setSimilarOpen(false)}>{hit.sourceAd.title ?? hit.sourceAd.id}</Link>
          </li>
        ))}
      </ul>
    </Modal>
  </section>;
}
