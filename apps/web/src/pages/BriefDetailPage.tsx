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
import './media.css';
import './briefs.css';

const CreativeBriefDocument = graphql(`
  query CreativeBriefDetail($id: ID!) {
    creativeBrief(id: $id) {
      id title audienceHypothesis desire hookType messageAngle visualFormat callToAction rationale focusText brandId createdAt zhTwJson
      brand { id name }
      references { sourceAdId title method similarity deleted }
      provider model promptVersion rawJson
      creatives { id variantIndex koreanText status localizations { id kind text } }
    }
  }
`);
const GenerateCreativeVariantsDocument = graphql(`mutation GenerateCreativeVariants($input: GenerateCreativeVariantsInput!) { generateCreativeVariants(input: $input) { job { id status } } }`);

type BriefFields = { title: string; audienceHypothesis: string; desire: string; hookType: string; messageAngle: string; visualFormat: string; callToAction: string; rationale: string };

export function BriefDetailPage() {
  const { lang, t } = useT();
  const { id } = useParams<{ id: string }>();
  const { data, refetch } = useQuery(CreativeBriefDocument, { variables: { id: id! }, skip: !id, pollInterval: 3000 });
  const [generateVariants] = useMutation(GenerateCreativeVariantsDocument);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const job = useJobPolling(jobId);
  useEffect(() => {
    if (job?.status === JobStatus.Failed) { setError(job.error ?? t('briefs.failed')); setJobId(null); return; }
    if (job?.status !== JobStatus.Succeeded) return;
    void refetch(); setJobId(null);
    const timer = window.setTimeout(() => void refetch(), 2000);
    return () => window.clearTimeout(timer);
  }, [job?.error, job?.status, refetch, t]);

  async function onGenerateVariants() {
    if (brief!.creatives.length > 0 && !window.confirm(t('briefs.confirmVariants', { count: brief!.creatives.length }))) return;
    setError(null);
    try {
      const result = await generateVariants({ variables: { input: { briefId: id!, type: CreativeType.Copy, count: 3 } } });
      setJobId(result.data!.generateCreativeVariants.job.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

  const brief = data?.creativeBrief;
  if (!brief) return <section><p className="muted">{t('briefs.loading')}</p></section>;
  const performanceContext = (JSON.parse(brief.rawJson) as { performanceContext?: { trackingCode: string; koreanText: string } }).performanceContext;
  const zhTw = brief.zhTwJson ? (JSON.parse(brief.zhTwJson) as BriefFields) : null;
  const showZh = lang === 'zhTw' && zhTw !== null;
  const fields: BriefFields = showZh ? zhTw! : brief;
  return (
    <section className="stage-create brief-detail ad-detail">
      <Link className="back-link" to="/briefs">{t('briefs.back')}</Link>
      <header className="page-header">
        <div>
          <div className="page-header-title-row"><h1>{fields.title}</h1><span className="step-chip">{t('briefs.createStep')}</span></div>
          <p>{t('briefs.detailMeta', { date: formatDate(String(brief.createdAt), lang), count: brief.creatives.length })}</p>
        </div>
        <div className="page-header-actions">
          <Button data-hint={t('briefs.variantsHint')} variant={brief.creatives.length === 0 ? 'primary' : 'secondary'} size="sm" disabled={Boolean(jobId)} onClick={() => void onGenerateVariants()}>{t('briefs.generateVariants')}</Button>
        </div>
      </header>
      {error && <p className="error" role="alert">{error}</p>}
      {job && job.status !== JobStatus.Succeeded && job.status !== JobStatus.Failed && <p>{t('briefs.generatingShort', { status: job.status })}</p>}

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
        <h2>{t('briefs.variantsTitle', { count: brief.creatives.length })}</h2>
        {brief.creatives.length === 0 && <p className="muted">{t('briefs.noVariants')}</p>}
        <ol className="variant-list">
          {brief.creatives.map((creative) => {
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
