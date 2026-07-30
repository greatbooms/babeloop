import { useMutation, useQuery } from '@apollo/client';
import { useEffect, useState } from 'react';
import { graphql } from '../generated';
import { JobStatus, PerformanceCoverage } from '../generated/graphql';
import { useJobPolling } from '../hooks/useJobPolling';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FormField } from '../components/FormField';
import { PageHeader } from '../components/PageHeader';
import { HelpPanel } from '../components/HelpPanel';
import { useT } from '../i18n/lang-context';
import './source-ads.css';
import './media.css';

const PerformanceExperimentsDocument = graphql(`
  query PerformanceExperiments {
    experiments { id name code }
  }
`);

const VariantPerformanceDocument = graphql(`
  query VariantPerformance($experimentId: ID!) {
    variantPerformance(experimentId: $experimentId) {
      experimentVariantId
      trackingCode
      hookType
      koreanTextSummary
      impressions
      clicks
      ctr
      installs
      cpi
      signups
      signupsCoverage
      firstMessages
      firstMessagesCoverage
      cost
      currency
    }
  }
`);

const ImportPerformanceCsvDocument = graphql(`
  mutation ImportPerformanceCsv($input: ImportPerformanceCsvInput!) {
    importPerformanceCsv(input: $input) {
      id
      importedRows
      updatedRows
      errorRows
      errors
      unmatchedTrackingCodes
      duplicateFile
    }
  }
`);

const GenerateBriefFromPerformanceDocument = graphql(`
  mutation GenerateBriefFromPerformance($input: GenerateBriefFromPerformanceInput!) {
    generateBriefFromPerformance(input: $input) { job { id status } }
  }
`);

function fileToBase64(file: File, readError: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error(readError));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });
}

type ImportSummary = {
  importedRows: number;
  updatedRows: number;
  errorRows: number;
  errors: string[];
  unmatchedTrackingCodes: string[];
  duplicateFile: boolean;
};

export function PerformancePage() {
  const { lang, t } = useT();
  const { data: experimentsData } = useQuery(PerformanceExperimentsDocument);
  const [experimentId, setExperimentId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [importCsv, { loading: importing }] = useMutation(ImportPerformanceCsvDocument);
  const [generateBrief] = useMutation(GenerateBriefFromPerformanceDocument);
  const { data: performanceData, refetch: refetchPerformance } = useQuery(
    VariantPerformanceDocument,
    { variables: { experimentId }, skip: !experimentId },
  );
  const job = useJobPolling(jobId);

  useEffect(() => {
    if (job?.status === JobStatus.Failed) {
      setError(job.error ?? t('performance.briefFailed'));
      setJobId(null);
      return;
    }
    if (job?.status !== JobStatus.Succeeded) return;
    setMessage(t('performance.briefCreated'));
    setJobId(null);
  }, [job?.error, job?.status, t]);

  async function onUpload() {
    if (!file) return;
    setError(null);
    setMessage(null);
    try {
      const result = await importCsv({
        variables: {
          input: { filename: file.name, fileBase64: await fileToBase64(file, t('performance.fileReadFailed')) },
        },
      });
      setSummary(result.data!.importPerformanceCsv);
      if (experimentId) await refetchPerformance();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function onGenerateBrief() {
    if (!experimentId) return;
    setError(null);
    setMessage(null);
    try {
      const result = await generateBrief({ variables: { input: { experimentId } } });
      setJobId(result.data!.generateBriefFromPerformance.job.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  const rows = performanceData?.variantPerformance ?? [];
  const numberText = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString(lang === 'zhTw' ? 'zh-TW' : 'ko-KR');
  const funnelText = (value: number | null | undefined, coverage: PerformanceCoverage) => coverage === PerformanceCoverage.Missing
    ? <span className="warn-text" title={t('performance.missingTitle')}>{t('performance.missing')}</span>
    : <>{numberText(value)}{coverage === PerformanceCoverage.Partial ? t('performance.partial') : ''}</>;

  return (
    <section className="stage-performance">
      <PageHeader title={t('performance.title')} step={t('performance.step')} description={t('performance.description')} />
      <HelpPanel page="performance" />
      <Card className="page-form-card">
        <h2>{t('performance.uploadTitle')}</h2>
        <details className="csv-guide"><summary>{t('performance.csvGuide')}</summary><p>
          {t('performance.csvHeader')}
        </p></details>
        <div className="upload-zone">
          <label className="button button-secondary button-sm file-button">
            {t('performance.chooseFile')}
            <input id="performance-csv" aria-label={t('performance.performanceCsv')} type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </label>
          <span className="form-hint">{file?.name ?? t('performance.chooseFileHint')}</span>
          <Button data-hint={t('performance.uploadHint')} variant="primary" size="sm" type="button" disabled={!file || importing} onClick={() => void onUpload()}>
            {t('performance.upload')}
          </Button>
        </div>

        {summary && (
          <div>
            <p className="notice">
              {t('performance.summary', { imported: summary.importedRows, updated: summary.updatedRows, errors: summary.errorRows })}
              {summary.duplicateFile ? t('performance.duplicate') : ''}
            </p>
            {summary.errors.length > 0 && (
              <ul aria-label={t('performance.csvErrors')}>
                {summary.errors.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
              </ul>
            )}
            {summary.unmatchedTrackingCodes.length > 0 && (
              <p role="alert">
                {t('performance.unmatched', { codes: summary.unmatchedTrackingCodes.join(', ') })}
              </p>
            )}
          </div>
        )}
      </Card>

      <Card className="card-stack">
        <h2>{t('performance.dashboard')}</h2>
        <FormField label={t('performance.experiment')} htmlFor="performance-experiment"><select id="performance-experiment" value={experimentId} onChange={(event) => setExperimentId(event.target.value)}>
            <option value="">{t('performance.select')}</option>
            {experimentsData?.experiments.map((experiment) => (
              <option key={experiment.id} value={experiment.id}>{experiment.name}</option>
            ))}
          </select></FormField>

        {experimentId && (
          <>
            <div className="table-wrap"><table className="data-table">
              <thead>
                <tr>
                  <th>{t('performance.trackingCode')}</th><th>{t('performance.hook')}</th><th>{t('performance.impressions')}</th><th>{t('performance.clicks')}</th><th>CTR</th>
                  <th>{t('performance.installs')}</th><th>CPI</th><th>{t('performance.signups')}</th><th>{t('performance.firstMessages')}</th><th>{t('performance.cost')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.experimentVariantId}>
                    <td>{row.trackingCode}</td>
                    <td>{row.hookType ?? row.koreanTextSummary}</td>
                    <td>{numberText(row.impressions)}</td>
                    <td>{numberText(row.clicks)}</td>
                    <td>{row.ctr == null ? '—' : `${(row.ctr * 100).toFixed(2)}%`}</td>
                    <td>{numberText(row.installs)}</td>
                    <td>{numberText(row.cpi)}</td>
                    <td>{funnelText(row.signups, row.signupsCoverage)}</td>
                    <td>{funnelText(row.firstMessages, row.firstMessagesCoverage)}</td>
                    <td>{row.cost == null ? '—' : `${numberText(row.cost)} ${row.currency}`}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <Button
              data-hint={t('performance.generateHint')}
              variant="primary"
              size="sm"
              type="button"
              disabled={Boolean(jobId) || rows.length === 0}
              onClick={() => void onGenerateBrief()}
            >
              {t('performance.generate')}
            </Button>
          </>
        )}
      </Card>

      {jobId && <p>{t('performance.generating')}</p>}
      {message && <p>{message}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
