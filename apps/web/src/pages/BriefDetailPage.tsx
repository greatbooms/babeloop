import { useMutation, useQuery } from '@apollo/client';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { graphql } from '../generated';
import { CreativeType, JobStatus, LocalizationKind } from '../generated/graphql';
import { useJobPolling } from '../hooks/useJobPolling';
import { formatDate } from '../i18n/format-date';
import { useT } from '../i18n/lang-context';
import { parseScenes } from '../lib/parse-scenes';
import './media.css';
import './briefs.css';

const CreativeBriefDocument = graphql(`
  query CreativeBriefDetail($id: ID!) {
    creativeBrief(id: $id) {
      id title audienceHypothesis desire hookType messageAngle visualFormat callToAction rationale focusText brandId createdAt zhTwJson
      brand { id name }
      references { sourceAdId title method similarity deleted }
      provider model promptVersion rawJson
      images { id url quality instructions createdAt costEstimateUsd }
      creatives { id variantIndex type koreanText scenesJson status localizations { id kind text } }
    }
  }
`);
const GenerateCreativeVariantsDocument = graphql(`mutation GenerateCreativeVariants($input: GenerateCreativeVariantsInput!) { generateCreativeVariants(input: $input) { job { id status } } }`);

type BriefFields = { title: string; audienceHypothesis: string; desire: string; hookType: string; messageAngle: string; visualFormat: string; callToAction: string; rationale: string };

export function BriefDetailPage() {
  const { lang, t } = useT();
  const { id } = useParams<{ id: string }>();
  const [pollFast, setPollFast] = useState(true);
  const { data, refetch } = useQuery(CreativeBriefDocument, { variables: { id: id! }, skip: !id, pollInterval: pollFast ? 3000 : 30_000, fetchPolicy: 'cache-and-network', nextFetchPolicy: 'cache-first' });
  const [generateVariants] = useMutation(GenerateCreativeVariantsDocument);
  const [jobId, setJobId] = useState<string | null>(null);
  const [scriptJobId, setScriptJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const job = useJobPolling(jobId);
  const scriptJob = useJobPolling(scriptJobId);
  useEffect(() => {
    const creatives = data?.creativeBrief?.creatives ?? [];
    setPollFast(
      Boolean(jobId || scriptJobId) ||
        creatives.some(
          (creative) =>
            creative.type === CreativeType.Copy &&
            !creative.localizations.some((localization) => localization.kind === LocalizationKind.AiDraft),
        ),
    );
  }, [data, jobId, scriptJobId]);
  useEffect(() => {
    if (job?.status === JobStatus.Failed) { setError(job.error ?? t('briefs.failed')); setJobId(null); return; }
    if (job?.status !== JobStatus.Succeeded) return;
    void refetch(); setJobId(null);
    const timer = window.setTimeout(() => void refetch(), 2000);
    return () => window.clearTimeout(timer);
  }, [job?.error, job?.status, refetch, t]);
  useEffect(() => {
    if (scriptJob?.status === JobStatus.Failed) { setError(scriptJob.error ?? t('briefs.failed')); setScriptJobId(null); return; }
    if (scriptJob?.status !== JobStatus.Succeeded) return;
    void refetch(); setScriptJobId(null);
    const timer = window.setTimeout(() => void refetch(), 2000);
    return () => window.clearTimeout(timer);
  }, [refetch, scriptJob?.error, scriptJob?.status, t]);

  async function onGenerateVariants() {
    const copies = brief!.creatives.filter((creative) => creative.type === CreativeType.Copy);
    if (copies.length > 0 && !window.confirm(t('briefs.confirmVariants', { count: copies.length }))) return;
    setError(null);
    try {
      const result = await generateVariants({ variables: { input: { briefId: id!, type: CreativeType.Copy, count: 3 } } });
      setJobId(result.data!.generateCreativeVariants.job.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

  async function onGenerateScript() {
    if (!window.confirm(t('briefs.confirmVideoScript'))) return;
    setError(null);
    try {
      const result = await generateVariants({
        variables: { input: { briefId: id!, type: CreativeType.VideoScript, count: 2 } },
      });
      setScriptJobId(result.data!.generateCreativeVariants.job.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

  const brief = data?.creativeBrief;
  if (!brief) return <section><p className="muted">{t('briefs.loading')}</p></section>;
  const performanceContext = (JSON.parse(brief.rawJson) as { performanceContext?: { trackingCode: string; koreanText: string } }).performanceContext;
  const zhTw = brief.zhTwJson ? (JSON.parse(brief.zhTwJson) as BriefFields) : null;
  const showZh = lang === 'zhTw' && zhTw !== null;
  const fields: BriefFields = showZh ? zhTw! : brief;
  const copyCreatives = brief.creatives.filter((creative) => creative.type === CreativeType.Copy);
  const videoScripts = brief.creatives.filter((creative) => creative.type === CreativeType.VideoScript);
  const anyJobActive = Boolean(jobId || scriptJobId);
  return (
    <section className="stage-create brief-detail ad-detail">
      <Link className="back-link" to="/briefs">{t('briefs.back')}</Link>
      <header className="page-header">
        <div>
          <div className="page-header-title-row"><h1>{fields.title}</h1><span className="step-chip">{t('briefs.createStep')}</span></div>
          <p>{t('briefs.detailMeta', { date: formatDate(String(brief.createdAt), lang), count: copyCreatives.length })}</p>
        </div>
        <div className="page-header-actions">
          <Button data-hint={t('briefs.videoScriptHint')} variant="secondary" size="sm" disabled={anyJobActive} onClick={() => void onGenerateScript()}>{t('briefs.videoScriptGenerate')}</Button>
          <Button data-hint={t('briefs.variantsHint')} variant={copyCreatives.length === 0 ? 'primary' : 'secondary'} size="sm" disabled={anyJobActive} onClick={() => void onGenerateVariants()}>{t('briefs.generateVariants')}</Button>
        </div>
      </header>
      {error && <p className="error" role="alert">{error}</p>}
      {job && job.status !== JobStatus.Succeeded && job.status !== JobStatus.Failed && <p>{t('briefs.generatingShort', { status: job.status })}</p>}
      {scriptJob && scriptJob.status !== JobStatus.Succeeded && scriptJob.status !== JobStatus.Failed && <p>{t('briefs.videoScriptGenerating', { status: scriptJob.status })}</p>}

      <Card className="card-stack">
        <h2>{t('briefs.fullContent')}</h2>
        {lang === 'zhTw' && !zhTw && <p className="muted">{t('briefs.noZh')}</p>}
        <div className="insight-facet"><span className="facet-label">{t('briefs.hook')}</span><div className="tag-row"><span className="tag tag-accent">{fields.hookType}</span></div></div>
        <div className="brief-fields">
          <div className="brief-field"><span className="facet-label">{t('briefs.desire')}</span><p>{fields.desire}</p></div>
          <div className="brief-field"><span className="facet-label">{t('briefs.messageAngle')}</span><p>{fields.messageAngle}</p></div>
          <div className="brief-field"><span className="facet-label">{t('briefs.visualFormat')}</span><p>{fields.visualFormat}</p></div>
          <div className="brief-field"><span className="facet-label">CTA</span><p>{fields.callToAction}</p></div>
          <div className="brief-field"><span className="facet-label">{t('briefs.target')}</span><p>{fields.audienceHypothesis}</p></div>
          <div className="brief-field brief-field-wide"><span className="facet-label">{t('briefs.rationale')}</span><p>{fields.rationale}</p></div>
        </div>
      </Card>

      <Card className="card-stack">
        <h2>{t('briefs.references')}</h2>
        <dl className="brand-dl">
          {brief.focusText && <div><dt>{t('briefs.inputFocus')}</dt><dd>{brief.focusText}</dd></div>}
          <div><dt>{t('briefs.brand')}</dt><dd>{brief.brand ? <Link to={`/brands/${brief.brand.id}`}>{brief.brand.name}</Link> : t('briefs.defaultContext')}</dd></div>
          <div><dt>{t('briefs.referenceAds')}</dt><dd>{brief.references.length ? <ul className="compact-list">{brief.references.map((reference, index) => <li key={`${reference.sourceAdId}-${index}`}>{reference.deleted || !reference.sourceAdId ? <span>{reference.title ?? t('briefs.unknownAd')} {t('briefs.deleted')}</span> : <Link to={`/ads/${reference.sourceAdId}`}>{reference.title ?? reference.sourceAdId}</Link>} {' '}<span className="status-badge">{reference.method === 'SIMILARITY' ? t('briefs.autoSimilarity', { value: (reference.similarity ?? 0).toFixed(2) }) : reference.method === 'MANUAL' ? t('briefs.manual') : t('briefs.noRecord')}</span></li>)}</ul> : t('briefs.noReferences')}</dd></div>
          {performanceContext && <div><dt>{t('briefs.performanceFeedback')}</dt><dd>{t('briefs.performanceText', { code: performanceContext.trackingCode, copy: performanceContext.koreanText })}</dd></div>}
        </dl>
        <p className="ai-meta">{t('briefs.aiInfo', { provider: brief.provider, model: brief.model, version: brief.promptVersion })}</p>
      </Card>

      <Card className="card-stack">
        <h2>{t('briefs.imagesTitle', { count: brief.images.length })}</h2>
        {brief.images.length === 0 && <p className="muted">{t('briefs.noImages')}</p>}
        <div className="brief-image-grid">
          {brief.images.map((image) => (
            <figure className="brief-image-item" key={image.id}>
              <a href={image.url} target="_blank" rel="noreferrer" aria-label={t('briefs.imageOpenOriginal')}>
                <img src={image.url} alt={t('briefs.imageAlt')} />
              </a>
              <figcaption>
                <div className="tag-row">
                  <span className="tag tag-accent">{image.quality === 'high' ? t('briefs.qualityHigh') : t('briefs.qualityLow')}</span>
                  <span className="tag">{image.costEstimateUsd == null ? t('briefs.costUnknown') : t('briefs.imageCost', { cost: image.costEstimateUsd.toFixed(2) })}</span>
                </div>
                <p>{image.instructions || t('briefs.noImageInstructions')}</p>
                <time>{formatDate(String(image.createdAt), lang)}</time>
              </figcaption>
            </figure>
          ))}
        </div>
      </Card>

      <Card className="card-stack">
        <h2>{t('briefs.videoScriptsTitle', { count: videoScripts.length })}</h2>
        {videoScripts.length === 0 && <p className="muted">{t('briefs.noVideoScripts')}</p>}
        <div className="video-script-list">
          {videoScripts.map((creative) => {
            const scenes = parseScenes(creative.scenesJson);
            return (
              <section className="variant-item" key={creative.id}>
                <div className="variant-head">
                  <span className="variant-chip">{t('briefs.videoScriptVariant', { index: creative.variantIndex })}</span>
                  <StatusBadge status={creative.status} />
                  <Link className="brand-detail-cta" to={`/review/${creative.id}`}>{t('briefs.viewInReview')}</Link>
                </div>
                {scenes.length === 0 ? <p className="muted">{t('briefs.noSceneData')}</p> : (
                  <div className="scene-table-wrap">
                    <table className="scene-table">
                      <thead><tr><th>{t('briefs.sceneSeconds')}</th><th>{t('briefs.sceneVisual')}</th><th>{t('briefs.sceneDialogue')}</th><th>{t('briefs.sceneCaption')}</th></tr></thead>
                      <tbody>{scenes.map((scene, index) => <tr key={`${creative.id}-${index}`}><td>{t('briefs.secondsValue', { seconds: scene.seconds })}</td><td>{scene.visual}</td><td>{scene.dialogue}</td><td>{scene.caption}</td></tr>)}</tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </Card>

      <Card className="card-stack">
        <h2>{t('briefs.variantsTitle', { count: copyCreatives.length })}</h2>
        {copyCreatives.length === 0 && <p className="muted">{t('briefs.noVariants')}</p>}
        <ol className="variant-list">
          {copyCreatives.map((creative) => {
            const draft = creative.localizations.find((localization) => localization.kind === LocalizationKind.AiDraft);
            return (
              <li className="variant-item" key={creative.id}>
                <div className="variant-head">
                  <span className="variant-chip">V{creative.variantIndex}</span>
                  <StatusBadge status={creative.status} />
                  <Link className="brand-detail-cta" to={`/review/${creative.id}`}>{t('briefs.viewInReview')}</Link>
                </div>
                <p className="long-copy">{creative.koreanText}</p>
                <div className="localized-box"><span className="facet-label">{t('briefs.zhDraft')}</span><p>{draft?.text ?? t('briefs.localizing')}</p></div>
              </li>
            );
          })}
        </ol>
      </Card>
    </section>
  );
}
