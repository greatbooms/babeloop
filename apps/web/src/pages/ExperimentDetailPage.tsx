import { useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { graphql } from '../generated';
import { formatDate } from '../i18n/format-date';
import { useT } from '../i18n/lang-context';
import './media.css';
import './briefs.css';
import './review.css';

const ExperimentDocument = graphql(`query ExperimentDetail($id: ID!) { experiment(id: $id) { id code name marketCode variants { id variantCode trackingCode exportedAt creative { id koreanText status } } } exportPackages(experimentId: $id) { id manifestJson createdAt } }`);
const ExportExperimentDocument = graphql(`mutation ExperimentsExport($input: ExportExperimentInput!) { exportExperiment(input: $input) { package { id } files { trackingCode filename url } manifestUrl } }`);
const AddableCreativesDocument = graphql(`query AddableCreatives { approved: creatives(status: APPROVED) { id briefTitle koreanText localizations { kind text } } }`);
const ExperimentAddCreativeDocument = graphql(`mutation ExperimentDetailAddCreative($input: AddCreativeToExperimentInput!) { addCreativeToExperiment(input: $input) { id trackingCode } }`);
interface ExportView { files: Array<{ trackingCode: string; filename: string; url: string }>; manifestUrl: string; }

function manifestFileCount(manifestJson: string): number | null {
  try {
    const parsed = JSON.parse(manifestJson) as unknown;
    if (Array.isArray(parsed)) return parsed.length;
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { files?: unknown[] }).files)) return (parsed as { files: unknown[] }).files.length;
    return null;
  } catch {
    return null;
  }
}

export function ExperimentDetailPage() {
  const { lang, t } = useT();
  const { id } = useParams<{ id: string }>(); const { data, refetch } = useQuery(ExperimentDocument, { variables: { id: id! }, skip: !id });
  const [exportExperiment] = useMutation(ExportExperimentDocument); const [exported, setExported] = useState<ExportView | null>(null); const [error, setError] = useState<string | null>(null);
  const { data: addableData, refetch: refetchAddable } = useQuery(AddableCreativesDocument);
  const [addCreative] = useMutation(ExperimentAddCreativeDocument);
  const [creativeSelection, setCreativeSelection] = useState('');
  async function onExport() { setError(null); try { const result = await exportExperiment({ variables: { input: { experimentId: id! } } }); setExported(result.data!.exportExperiment); await refetch(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }
  const experiment = data?.experiment; if (!experiment) return <section><p className="muted">{t('experiments.loading')}</p></section>;
  const exportCount = data?.exportPackages.length ?? 0;
  const memberIds = new Set(experiment.variants.map((variant) => variant.creative.id));
  const addable = (addableData?.approved ?? []).filter((creative) => !memberIds.has(creative.id));
  const selectedCreative = creativeSelection || addable[0]?.id || '';
  async function onAddCreative() {
    setError(null);
    try {
      await addCreative({ variables: { input: { experimentId: id!, creativeId: selectedCreative } } });
      setCreativeSelection('');
      await refetch();
      await refetchAddable();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  return <section className="stage-export experiment-detail ad-detail">
    <Link className="back-link" to="/experiments">{t('experiments.back')}</Link>
    <header className="page-header">
      <div>
        <div className="page-header-title-row"><h1>{experiment.name}</h1><span className="tag tag-accent">{experiment.code}</span></div>
        <p>{t('experiments.detailMeta', { market: experiment.marketCode, count: experiment.variants.length, exports: exportCount })}</p>
      </div>
      <div className="page-header-actions"><Button data-hint={t('experiments.exportHint')} variant="primary" size="sm" onClick={() => void onExport()}>{t('experiments.export')}</Button></div>
    </header>
    {error && <p className="error" role="alert">{error}</p>}
    <Card className="card-stack">
      <h2>{t('experiments.variants')}</h2>
      {experiment.variants.length === 0 && <p className="muted">{t('experiments.noVariants')}</p>}
      {experiment.variants.length > 0 && (
        <div className="table-wrap"><table className="data-table"><thead><tr><th>{t('experiments.variantCode')}</th><th>{t('experiments.trackingCode')}</th><th>{t('experiments.copySummary')}</th><th>{t('experiments.status')}</th><th>{t('experiments.exportedAtColumn')}</th></tr></thead><tbody>{experiment.variants.map((variant) => <tr key={variant.id}><td><span className="variant-chip">{variant.variantCode}</span></td><td><strong>{variant.trackingCode}</strong></td><td><Link to={`/review/${variant.creative.id}`}>{variant.creative.koreanText.slice(0, 100)}</Link></td><td><StatusBadge status={variant.creative.status} /></td><td>{variant.exportedAt ? formatDate(String(variant.exportedAt), lang) : '—'}</td></tr>)}</tbody></table></div>
      )}
    </Card>
    <Card className="card-stack">
      <h2>{t('experiments.addCreativeTitle')}</h2>
      {addable.length === 0 ? <p className="muted">{t('experiments.noAddable')}</p> : (
        <div className="experiment-add-row">
          <label>{t('experiments.creativeSelection')}<select value={selectedCreative} onChange={(event) => setCreativeSelection(event.target.value)}>{addable.map((creative) => { const zhText = creative.localizations[0]?.text; const shown = lang === 'zhTw' && zhText ? zhText : creative.koreanText; return <option key={creative.id} value={creative.id}>{`${shown.split('\n')[0].slice(0, 40)} — ${creative.briefTitle}`}</option>; })}</select></label>
          <Button variant="primary" size="sm" data-hint={t('experiments.addCreativeHint')} disabled={!selectedCreative} onClick={() => void onAddCreative()}>{t('experiments.addCreative')}</Button>
        </div>
      )}
      <p className="form-hint">{t('experiments.membershipRules')}</p>
    </Card>
    {exported && (
      <Card className="card-stack">
        <h2>{t('experiments.resultFiles')}</h2>
        <ul className="similar-list">
          {exported.files.map((file) => (
            <li className="similar-row" key={file.trackingCode}>
              <span className="sim-chip">{file.trackingCode}</span>
              <a href={file.url}>{file.filename}</a>
            </li>
          ))}
          <li className="similar-row"><span className="sim-chip">manifest</span><a href={exported.manifestUrl}>manifest.csv</a></li>
        </ul>
      </Card>
    )}
    <Card className="card-stack">
      <h2>{t('experiments.exportHistory')}</h2>
      {data?.exportPackages.length ? data.exportPackages.map((item) => {
        const count = manifestFileCount(item.manifestJson);
        return (
          <div className="event-row" key={item.id}>
            <span className="event-date">{formatDate(String(item.createdAt), lang)}</span>
            <span className="event-note">{count == null ? item.manifestJson.slice(0, 80) : t('experiments.historyFiles', { count })}</span>
          </div>
        );
      }) : <p className="muted">{t('experiments.noHistory')}</p>}
    </Card>
  </section>;
}
