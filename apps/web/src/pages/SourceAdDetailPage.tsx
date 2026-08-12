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
import { formatDate } from '../i18n/format-date';
import { useT } from '../i18n/lang-context';
import './source-ads.css';

const SourceAdDocument = graphql(`
  query SourceAdDetail($id: ID!) {
    sourceAd(id: $id) {
      id status title adText origin sourceUrl networks countries firstSeenAt lastSeenAt provider confidence
      competitor { id name }
      mediaAsset { id kind mediaUrl ocrResults { id text } transcriptions { id text language } }
      latestAnalysis { id summary hookType targetAudience emotionalTriggers genres zhTwJson }
      referencingBriefs { id title }
    }
  }
`);
const SimilarDocument = graphql(`query Similar($input: SimilarSourceAdsInput!) { similarSourceAds(input: $input) { similarity sourceAd { id title adText } } }`);
const UpdateSourceAdTextDocument = graphql(`mutation UpdateSourceAdText($input: UpdateSourceAdTextInput!) { updateSourceAdText(input: $input) { id adText } }`);
const ProcessMediaAssetDocument = graphql(`mutation ProcessMediaAsset($mediaAssetId: ID!) { processMediaAsset(mediaAssetId: $mediaAssetId) { id status } }`);
const AnalyzeSourceAdDocument = graphql(`mutation AnalyzeSourceAd($input: AnalyzeSourceAdInput!) { analyzeSourceAd(input: $input) { id status } }`);
const RedownloadMediaDocument = graphql(`mutation RedownloadSourceAdMedia($sourceAdId: ID!) { redownloadSourceAdMedia(sourceAdId: $sourceAdId) { id status } }`);
const AdDetailBrandsDocument = graphql(`query AdDetailBrands { brands { id name } }`);
const GenerateBriefFromAdDocument = graphql(`mutation GenerateBriefFromAd($input: GenerateCreativeBriefInput!) { generateCreativeBrief(input: $input) { job { id status } } }`);

export function SourceAdDetailPage() {
  const { lang, t } = useT();
  const { id } = useParams<{ id: string }>();
  // 진행 중(잡 활성·ANALYZING)일 때만 3초, 평상시 30초 폴링
  const [pollFast, setPollFast] = useState(true);
  const { data, refetch } = useQuery(SourceAdDocument, { variables: { id: id! }, skip: !id, pollInterval: pollFast ? 3000 : 30_000, fetchPolicy: 'cache-and-network', nextFetchPolicy: 'cache-first' });
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [editingText, setEditingText] = useState(false);
  const [adTextDraft, setAdTextDraft] = useState('');
  const [updateAdText] = useMutation(UpdateSourceAdTextDocument);
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
  useEffect(() => {
    setPollFast(Boolean(jobId) || Boolean(briefJobId) || data?.sourceAd?.status === 'ANALYZING');
  }, [data, jobId, briefJobId]);
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
    if (briefJob?.status === 'FAILED') setError(briefJob.error ?? t('ads.briefFailed'));
  }, [briefJob?.status, briefJob?.resultJson, briefJob?.error, navigate, t]);

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
      setError(code === 'EMBEDDING_NOT_READY' ? t('ads.embeddingNotReady') : cause instanceof Error ? cause.message : String(cause));
    }
  }

  if (!ad) return <section><p className="muted">{t('ads.loading')}</p></section>;

  async function onSaveAdText() {
    await updateAdText({ variables: { input: { sourceAdId: id!, adText: adTextDraft } } });
    setEditingText(false);
    await refetch();
  }
  const hasText = Boolean(ad.adText) || (ad.mediaAsset?.ocrResults.length ?? 0) > 0 || (ad.mediaAsset?.transcriptions.length ?? 0) > 0;
  const hasAnalysis = Boolean(ad.latestAnalysis);
  const hasBrief = ad.referencingBriefs.length > 0;
  type AnalysisFields = { summary: string; hookType: string; targetAudience: string[]; emotionalTriggers: string[]; genres: string[] };
  const zhTwAnalysis = ad.latestAnalysis?.zhTwJson ? JSON.parse(ad.latestAnalysis.zhTwJson) as AnalysisFields : null;
  const analysis: AnalysisFields | null = ad.latestAnalysis
    ? (lang === 'zhTw' && zhTwAnalysis ? zhTwAnalysis : ad.latestAnalysis)
    : null;
  return (
    <section className="stage-collect ad-detail">
      <Link className="back-link" to="/ads">{t('ads.back')}</Link>
      <header className="page-header">
        <div><div className="page-header-title-row"><h1>{ad.title ?? ad.adText ?? ad.id}</h1><StatusBadge status={ad.status} /></div><p>{ad.competitor?.name ?? t('ads.noAdvertiserInfo')}</p></div>
        <div className="page-header-actions detail-actions">
          <div className="action-steps">
          {ad.mediaAsset && (
            <span className="action-step">
              <span className={`action-step-num${hasText ? ' done' : ''}`} aria-hidden="true">{hasText ? '✓' : '1'}</span>
              <Button data-hint={t('ads.extractHint')} size="sm" variant={!hasText ? 'primary' : undefined} onClick={() => { if (hasText && !window.confirm(t('ads.extractConfirm'))) return; void run(async () => (await processMediaAsset({ variables: { mediaAssetId: ad.mediaAsset!.id } })).data!.processMediaAsset.id); }}>{t('ads.extract')}</Button>
            </span>
          )}
          <span className="action-step">
            <span className={`action-step-num${hasAnalysis ? ' done' : ''}`} aria-hidden="true">{hasAnalysis ? '✓' : '2'}</span>
            <Button data-hint={t('ads.analyzeHint')} size="sm" variant={hasText && !hasAnalysis ? 'primary' : undefined} onClick={() => { if (hasAnalysis && !window.confirm(t('ads.analyzeConfirm'))) return; void run(async () => (await analyzeSourceAd({ variables: { input: { sourceAdId: ad.id } } })).data!.analyzeSourceAd.id); }}>{t('ads.analyze')}</Button>
          </span>
          <span className="action-step">
            <span className={`action-step-num${hasBrief ? ' done' : ''}`} aria-hidden="true">{hasBrief ? '✓' : '3'}</span>
            <Button data-hint={t('ads.briefHint')} size="sm" variant={hasAnalysis && !hasBrief ? 'primary' : undefined} onClick={() => setBriefModalOpen(true)}>{t('ads.createBrief')}</Button>
          </span>
          </div>
          <div className="action-utils">
            <Button data-hint={t('ads.similarHint')} size="sm" onClick={() => void onSimilar()}>{t('ads.similar')}</Button>
            {ad.sourceUrl && <Button data-hint={t('ads.redownloadHint')} size="sm" onClick={() => void run(async () => (await redownloadMedia({ variables: { sourceAdId: ad.id } })).data!.redownloadSourceAdMedia.id)}>{t('ads.redownload')}</Button>}
          </div>
        </div>
      </header>
      <p className="action-flow-hint">{t('ads.flow')}</p>
      {error && <p className="error" role="alert">{error}</p>}
      {job && job.status !== 'SUCCEEDED' && job.status !== 'FAILED' && <p>{t('ads.analyzing', { status: job.status })}</p>}
      {briefJob && briefJob.status !== 'SUCCEEDED' && briefJob.status !== 'FAILED' && <p>{t('ads.briefGenerating', { status: briefJob.status })}</p>}
      <Card className="card-stack">
        <h2>{t('ads.media')}</h2>
        {mediaUrl && ad.mediaAsset ? <div className="detail-media">{ad.mediaAsset.kind === MediaAssetKind.Video ? <video controls src={mediaUrl} /> : <img src={mediaUrl} alt={ad.title ?? t('ads.originalAlt')} />}<a href={mediaUrl} download>{t('common.originalDownload')}</a></div> : <p className="muted">{t('ads.noMedia')}</p>}
      </Card>
      <Card className="card-stack"><h2>{t('ads.meta')}</h2><dl className="brand-dl"><div><dt>{t('ads.advertiser')}</dt><dd>{ad.competitor?.name ?? t('ads.none')}</dd></div><div><dt>{t('ads.networkCountry')}</dt><dd>{[...ad.networks, ...ad.countries].join(' · ') || t('ads.none')}</dd></div><div><dt>{t('ads.period')}</dt><dd>{ad.firstSeenAt ? formatDate(String(ad.firstSeenAt), lang) : t('ads.noDate')} ~ {ad.lastSeenAt ? formatDate(String(ad.lastSeenAt), lang) : t('ads.noDate')}</dd></div><div><dt>{t('ads.source')}</dt><dd>{ad.origin} · {ad.provider}{ad.sourceUrl && <> · <a href={ad.sourceUrl} target="_blank" rel="noreferrer">{t('ads.originalLink')}</a></>}</dd></div><div><dt>{t('ads.confidence')}</dt><dd>{ad.confidence}</dd></div></dl></Card>
      <Card className="card-stack"><h2>{t('ads.extractedText')}</h2>{ad.adText && !editingText && <><h3>{t('ads.adCopy')}</h3><p className="long-copy">{ad.adText}</p></>}{ad.mediaAsset?.ocrResults.map((item) => <div key={item.id}><h3>OCR</h3><p className="long-copy">{item.text}</p></div>)}{ad.mediaAsset?.transcriptions.map((item) => <div key={item.id}><h3>{t('ads.transcription')}{item.language ? ` (${item.language})` : ''}</h3><p className="long-copy">{item.text}</p></div>)}{!ad.adText && !editingText && !ad.mediaAsset?.ocrResults.length && !ad.mediaAsset?.transcriptions.length && <p className="muted">{t('ads.noExtractedText')}</p>}
        {editingText ? (
          <div className="page-form">
            <textarea value={adTextDraft} placeholder={t('ads.adCopyPlaceholder')} onChange={(event) => setAdTextDraft(event.target.value)} rows={4} />
            <div className="inline-actions">
              <Button variant="primary" size="sm" disabled={!adTextDraft.trim()} onClick={() => void onSaveAdText()}>{t('common.save')}</Button>
              <Button variant="secondary" size="sm" onClick={() => setEditingText(false)}>{t('common.cancel')}</Button>
            </div>
          </div>
        ) : (
          <div><Button variant="secondary" size="sm" data-hint={t('ads.editAdCopyHint')} onClick={() => { setAdTextDraft(ad.adText ?? ''); setEditingText(true); }}>{ad.adText ? t('ads.editAdCopy') : t('ads.addAdCopy')}</Button></div>
        )}</Card>
      <Card className="card-stack"><h2>{t('ads.latestAnalysis')}</h2>{analysis ? <>{lang === 'zhTw' && !zhTwAnalysis && <p className="muted">{t('ads.noZhAnalysis')}</p>}<dl className="brand-dl"><div><dt>{t('ads.summary')}</dt><dd>{analysis.summary}</dd></div><div><dt>{t('ads.hook')}</dt><dd>{analysis.hookType}</dd></div><div><dt>{t('ads.target')}</dt><dd>{analysis.targetAudience.join(', ')}</dd></div><div><dt>{t('ads.emotion')}</dt><dd>{analysis.emotionalTriggers.join(', ')}</dd></div><div><dt>{t('ads.genre')}</dt><dd>{analysis.genres.join(', ')}</dd></div></dl></> : <p className="muted">{t('ads.noAnalysis')}</p>}</Card>
      <Card className="card-stack"><h2>{t('ads.referencingBriefs')}</h2>{ad.referencingBriefs.length ? <ul className="compact-list">{ad.referencingBriefs.map((brief) => <li key={brief.id}><Link to={`/briefs/${brief.id}`}>{brief.title}</Link></li>)}</ul> : <p className="muted">{t('ads.noReferencingBriefs')}</p>}</Card>
      {similarQuery.loading && <p>{t('common.search')}</p>}
      <Modal title={t('ads.similar')} open={similarOpen && Boolean(similarQuery.data)} onClose={() => setSimilarOpen(false)}>
        <p className="muted">{t('ads.similarDescription')}</p>
        {similarQuery.data?.similarSourceAds.length === 0 && <p className="muted">{t('ads.noSimilar')}</p>}
        <ul className="similar-list">
          {similarQuery.data?.similarSourceAds.map((similar) => (
            <li className="similar-row" key={similar.sourceAd.id}>
              <span className="sim-chip">{t('ads.similarity', { value: similar.similarity.toFixed(2) })}</span>
              <Link to={`/ads/${similar.sourceAd.id}`} onClick={() => setSimilarOpen(false)}>{similar.sourceAd.title ?? similar.sourceAd.adText ?? similar.sourceAd.id}</Link>
            </li>
          ))}
        </ul>
      </Modal>
      <Modal title={t('ads.createBriefFromAd')} open={briefModalOpen} onClose={() => setBriefModalOpen(false)}>
        <p className="muted">{t('ads.createBriefDescription')}</p>
        <FormField label={t('ads.brand')} htmlFor="ad-brief-brand"><select id="ad-brief-brand" value={briefBrandId} onChange={(event) => setBriefBrandId(event.target.value)}><option value="">{t('ads.noSelection')}</option>{brandsQuery.data?.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></FormField>
        <FormField label={t('ads.briefTitle')} htmlFor="ad-brief-title"><input id="ad-brief-title" value={briefTitle} onChange={(event) => setBriefTitle(event.target.value)} /></FormField>
        <FormField label={t('ads.focus')} htmlFor="ad-brief-focus"><textarea id="ad-brief-focus" placeholder={t('ads.focusPlaceholder')} value={briefFocus} onChange={(event) => setBriefFocus(event.target.value)} /></FormField>
        <Button variant="primary" onClick={() => { setBriefModalOpen(false); void run(async () => { const result = await generateBrief({ variables: { input: { sourceAdIds: [ad.id], brandId: briefBrandId || undefined, title: briefTitle || undefined, focusText: briefFocus || undefined } } }); setBriefJobId(result.data!.generateCreativeBrief.job.id); return null; }); }}>{t('ads.start')}</Button>
      </Modal>
    </section>
  );
}
