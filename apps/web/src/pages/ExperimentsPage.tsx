import { useMutation, useQuery } from '@apollo/client';
import { FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FormField } from '../components/FormField';
import { HelpPanel } from '../components/HelpPanel';
import { PageHeader } from '../components/PageHeader';
import { graphql } from '../generated';
import { useT } from '../i18n/lang-context';

const ExperimentsPageDocument = graphql(`query ExperimentsPage { experiments { id code name marketCode hasExports variants { id } } }`);
const CreateExperimentDocument = graphql(`mutation ExperimentsCreate($input: CreateExperimentInput!) { createExperiment(input: $input) { id code name } }`);

export function ExperimentsPage() {
  const { t } = useT();
  const { data, refetch } = useQuery(ExperimentsPageDocument);
  const [createExperiment] = useMutation(CreateExperimentDocument);
  const [showCreate, setShowCreate] = useState(false); const [code, setCode] = useState(''); const [name, setName] = useState(''); const [error, setError] = useState<string | null>(null);
  async function onCreate(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(null); try { await createExperiment({ variables: { input: { code, name } } }); setCode(''); setName(''); setShowCreate(false); await refetch(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }
  return <section className="stage-export">
    <PageHeader title={t('experiments.title')} step={t('experiments.step')} description={t('experiments.description')} actions={<Button variant="primary" onClick={() => setShowCreate((value) => !value)}>{t('experiments.newExperiment')}</Button>} />
    <HelpPanel page="experiments" />
    {showCreate && <Card className="page-form-card"><form className="page-form" onSubmit={onCreate}><FormField label={t('experiments.code')} htmlFor="experiment-code"><input id="experiment-code" required value={code} onChange={(event) => setCode(event.target.value)} /></FormField><FormField label={t('experiments.name')} htmlFor="experiment-name"><input id="experiment-name" required value={name} onChange={(event) => setName(event.target.value)} /></FormField><div className="inline-actions"><Button variant="primary" type="submit">{t('experiments.create')}</Button><Button type="button" onClick={() => setShowCreate(false)}>{t('common.cancel')}</Button></div></form></Card>}
    {error && <p role="alert">{error}</p>}
    <ul className="card-list card-grid">{data?.experiments.map((experiment) => <li key={experiment.id}><Link className="brand-list-card" to={`/experiments/${experiment.id}`}><Card className="card-stack"><span className="experiment-code">{experiment.code}</span><h2>{experiment.name}</h2><p className="muted">{t('experiments.meta', { market: experiment.marketCode, count: experiment.variants.length })}</p><p className="muted">{experiment.hasExports ? t('experiments.hasExport') : t('experiments.noExport')}</p><span className="brand-detail-cta">{t('common.detail')}</span></Card></Link></li>)}</ul>
  </section>;
}
