import { useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { graphql } from '../generated';
import { formatDate } from '../i18n/format-date';
import { useT } from '../i18n/lang-context';

const ExperimentDocument = graphql(`query ExperimentDetail($id: ID!) { experiment(id: $id) { id code name marketCode variants { id variantCode trackingCode creative { id koreanText status } } } exportPackages(experimentId: $id) { id manifestJson createdAt } }`);
const ExportExperimentDocument = graphql(`mutation ExperimentsExport($input: ExportExperimentInput!) { exportExperiment(input: $input) { package { id } files { trackingCode filename url } manifestUrl } }`);
interface ExportView { files: Array<{ trackingCode: string; filename: string; url: string }>; manifestUrl: string; }

export function ExperimentDetailPage() {
  const { lang, t } = useT();
  const { id } = useParams<{ id: string }>(); const { data, refetch } = useQuery(ExperimentDocument, { variables: { id: id! }, skip: !id });
  const [exportExperiment] = useMutation(ExportExperimentDocument); const [exported, setExported] = useState<ExportView | null>(null); const [error, setError] = useState<string | null>(null);
  async function onExport() { setError(null); try { const result = await exportExperiment({ variables: { input: { experimentId: id! } } }); setExported(result.data!.exportExperiment); await refetch(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }
  const experiment = data?.experiment; if (!experiment) return <section><p className="muted">{t('experiments.loading')}</p></section>;
  return <section className="stage-export experiment-detail"><Link className="back-link" to="/experiments">{t('experiments.back')}</Link><header className="page-header"><div><div className="page-header-title-row"><h1>{experiment.name}</h1><span className="experiment-code">{experiment.code}</span></div><p>{experiment.marketCode}</p></div><div className="page-header-actions"><Button data-hint={t('experiments.exportHint')} variant="primary" onClick={() => void onExport()}>{t('experiments.export')}</Button></div></header>
    {error && <p role="alert">{error}</p>}
    <Card className="card-stack"><h2>{t('experiments.variants')}</h2><div className="table-wrap"><table className="data-table"><thead><tr><th>{t('experiments.variantCode')}</th><th>{t('experiments.trackingCode')}</th><th>{t('experiments.copySummary')}</th><th>{t('experiments.status')}</th></tr></thead><tbody>{experiment.variants.map((variant) => <tr key={variant.id}><td>{variant.variantCode}</td><td>{variant.trackingCode}</td><td><Link to={`/review/${variant.creative.id}`}>{variant.creative.koreanText.slice(0, 100)}</Link></td><td><StatusBadge status={variant.creative.status} /></td></tr>)}</tbody></table></div></Card>
    {exported && <Card className="card-stack"><h2>{t('experiments.resultFiles')}</h2>{exported.files.map((file) => <p key={file.trackingCode}><a href={file.url}>{file.filename}</a></p>)}<p><a href={exported.manifestUrl}>manifest.csv</a></p></Card>}
    <Card className="card-stack"><h2>{t('experiments.exportHistory')}</h2>{data?.exportPackages.length ? <ul className="compact-list">{data.exportPackages.map((item) => <li key={item.id}><span>{formatDate(String(item.createdAt), lang)} · {item.manifestJson}</span></li>)}</ul> : <p className="muted">{t('experiments.noHistory')}</p>}</Card>
  </section>;
}
