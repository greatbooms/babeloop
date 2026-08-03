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
import './performance.css';

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

const PerformanceSyncStatusDocument = graphql(`
  query PerformanceSyncStatus {
    performanceSyncStatus {
      configured
      provider
      cron
      lastSyncedAt
    }
  }
`);

const SyncPerformanceFromSnowflakeDocument = graphql(`
  mutation SyncPerformanceFromSnowflake {
    syncPerformanceFromSnowflake {
      id
      status
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

type SyncSummary = {
  rows: number;
  importedRows: number;
  updatedRows: number;
  unmatched: number;
};

function parseSyncSummary(resultJson: string | null | undefined): SyncSummary {
  if (!resultJson) return { rows: 0, importedRows: 0, updatedRows: 0, unmatched: 0 };
  try {
    const result = JSON.parse(resultJson) as Partial<SyncSummary>;
    return {
      rows: Number(result.rows ?? 0),
      importedRows: Number(result.importedRows ?? 0),
      updatedRows: Number(result.updatedRows ?? 0),
      unmatched: Number(result.unmatched ?? 0),
    };
  } catch {
    return { rows: 0, importedRows: 0, updatedRows: 0, unmatched: 0 };
  }
}

export function PerformancePage() {
  const { lang, t } = useT();
  const { data: experimentsData } = useQuery(PerformanceExperimentsDocument);
  const [experimentId, setExperimentId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [syncJobId, setSyncJobId] = useState<string | null>(null);
  const [importCsv, { loading: importing }] = useMutation(ImportPerformanceCsvDocument);
  const [generateBrief] = useMutation(GenerateBriefFromPerformanceDocument);
  const [syncPerformance, { loading: enqueueingSync }] = useMutation(SyncPerformanceFromSnowflakeDocument);
  const { data: syncStatusData, refetch: refetchSyncStatus } = useQuery(PerformanceSyncStatusDocument);
  const { data: performanceData, refetch: refetchPerformance } = useQuery(
    VariantPerformanceDocument,
    { variables: { experimentId }, skip: !experimentId },
  );
  const job = useJobPolling(jobId);
  const syncJob = useJobPolling(syncJobId);

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

  useEffect(() => {
    if (!syncJobId) return;
    if (syncJob?.status === JobStatus.Failed) {
      setError(t('performance.syncFailed'));
      setSyncJobId(null);
      return;
    }
    if (syncJob?.status !== JobStatus.Succeeded) return;
    setSyncSummary(parseSyncSummary(syncJob.resultJson));
    void refetchSyncStatus();
    if (experimentId) void refetchPerformance();
    setSyncJobId(null);
  }, [experimentId, refetchPerformance, refetchSyncStatus, syncJob?.error, syncJob?.resultJson, syncJob?.status, syncJobId, t]);

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

  async function onSyncPerformance() {
    setError(null);
    setMessage(null);
    setSyncSummary(null);
    try {
      const result = await syncPerformance();
      setSyncJobId(result.data!.syncPerformanceFromSnowflake.id);
    } catch (cause) {
      const code = (cause as { graphQLErrors?: Array<{ extensions?: { code?: string } }> })
        .graphQLErrors?.[0]?.extensions?.code;
      setError(code === 'NOT_CONFIGURED'
        ? t('performance.snowflakeNotConfigured')
        : t('performance.syncFailed'));
    }
  }

  const rows = performanceData?.variantPerformance ?? [];
  const numberText = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString(lang === 'zhTw' ? 'zh-TW' : 'ko-KR');
  const funnelText = (value: number | null | undefined, coverage: PerformanceCoverage) => coverage === PerformanceCoverage.Missing
    ? <span className="warn-text" title={t('performance.missingTitle')}>{t('performance.missing')}</span>
    : <>{numberText(value)}{coverage === PerformanceCoverage.Partial ? t('performance.partial') : ''}</>;
  const syncStatus = syncStatusData?.performanceSyncStatus;
  const syncDateTime = (value: string) => new Intl.DateTimeFormat(
    lang === 'zhTw' ? 'zh-TW' : 'ko-KR',
    { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Taipei' },
  ).format(new Date(value));
  const syncSchedule = (cron: string | null | undefined) => {
    if (!cron) return t('performance.autoSyncOff');
    const parts = cron.trim().split(/\s+/);
    if (parts.length === 5 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1]) && parts.slice(2).every((part) => part === '*')) {
      const time = `${parts[1].padStart(2, '0')}:${parts[0].padStart(2, '0')}`;
      return t('performance.dailySync', { time });
    }
    return t('performance.customSyncCron', { cron });
  };

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

      <Card className={`page-form-card performance-sync-card${syncStatus && !syncStatus.configured ? ' is-dormant' : ''}`}>
        <h2>{t('performance.snowflakeTitle')}</h2>
        <p className="performance-sync-description">{t('performance.snowflakeDescription')}</p>
        <div className="performance-sync-meta">
          <span>
            {syncStatus
              ? syncStatus.lastSyncedAt
                ? t('performance.lastSynced', { date: syncDateTime(syncStatus.lastSyncedAt) })
                : t('performance.neverSynced')
              : t('common.loading')}
          </span>
          <span>{syncStatus ? syncSchedule(syncStatus.cron) : t('common.loading')}</span>
        </div>
        {syncStatus && !syncStatus.configured && (
          <p className="performance-sync-guidance">{t('performance.snowflakeNotConfigured')}</p>
        )}
        <div className="performance-sync-actions">
          <Button
            data-hint={t('performance.syncHint')}
            variant="primary"
            size="sm"
            type="button"
            disabled={!syncStatus?.configured || enqueueingSync || Boolean(syncJobId)}
            onClick={() => void onSyncPerformance()}
          >
            {syncJobId
              ? t('performance.syncing', { status: syncJob?.status ?? JobStatus.Queued })
              : t('performance.syncNow')}
          </Button>
        </div>
        {syncSummary && (
          <p className="notice">
            {t('performance.syncSummary', {
              imported: syncSummary.importedRows,
              updated: syncSummary.updatedRows,
              unmatched: syncSummary.unmatched,
            })}
          </p>
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
