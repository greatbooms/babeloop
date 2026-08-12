import { useMutation, useQuery } from '@apollo/client';
import { FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FormField } from '../components/FormField';
import { HelpPanel } from '../components/HelpPanel';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { graphql } from '../generated';
import { useT } from '../i18n/lang-context';
import './media.css';
import './briefs.css';

const ExperimentsPageDocument = graphql(`query ExperimentsPage { experiments { id code name marketCode hasExports variants { id } } }`);
const CreateExperimentDocument = graphql(`mutation ExperimentsCreate($input: CreateExperimentInput!) { createExperiment(input: $input) { id code name } }`);

export function ExperimentsPage() {
  const { t } = useT();
  const { data, refetch } = useQuery(ExperimentsPageDocument);
  const [createExperiment, { loading: creating }] = useMutation(CreateExperimentDocument);
  const [showCreate, setShowCreate] = useState(false); const [code, setCode] = useState(''); const [name, setName] = useState(''); const [error, setError] = useState<string | null>(null);
  async function onCreate(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(null); try { await createExperiment({ variables: { input: { code, name } } }); setCode(''); setName(''); setShowCreate(false); await refetch(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }
  const experiments = data?.experiments ?? [];
  return <section className="stage-export">
    <PageHeader title={t('experiments.title')} step={t('experiments.step')} description={t('experiments.description')} actions={<Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>{t('experiments.newExperiment')}</Button>} />
    <HelpPanel page="experiments" />
    <Modal title={t('experiments.newExperiment')} open={showCreate} onClose={() => setShowCreate(false)}>
      <p className="muted">{t('experiments.createHelp')}</p>
      <form className="page-form" onSubmit={onCreate}>
        <FormField label={t('experiments.code')} htmlFor="experiment-code"><input id="experiment-code" required value={code} onChange={(event) => setCode(event.target.value)} /></FormField>
        <FormField label={t('experiments.name')} htmlFor="experiment-name"><input id="experiment-name" required value={name} onChange={(event) => setName(event.target.value)} /></FormField>
        <Button variant="primary" type="submit" disabled={creating}>{t('experiments.create')}</Button>
      </form>
    </Modal>
    {error && <p className="error" role="alert">{error}</p>}
    {experiments.length === 0 ? (
      <Card className="empty-state"><p className="muted">{t('experiments.empty')}</p></Card>
    ) : (
      <ul className="briefs-grid">
        {experiments.map((experiment) => (
          <li key={experiment.id}>
            <Card className="brief-card">
              <div className="tag-row"><span className="tag tag-accent">{experiment.code}</span>{experiment.hasExports && <span className="status-badge status-positive">{t('experiments.hasExport')}</span>}</div>
              <h2><Link to={`/experiments/${experiment.id}`}>{experiment.name}</Link></h2>
              <p className="brief-meta">{t('experiments.meta', { market: experiment.marketCode, count: experiment.variants.length })}</p>
              <Link className="brand-detail-cta" to={`/experiments/${experiment.id}`}>{t('common.detail')}</Link>
            </Card>
          </li>
        ))}
      </ul>
    )}
  </section>;
}
