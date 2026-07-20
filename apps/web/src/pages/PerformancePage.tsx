import { useMutation, useQuery } from '@apollo/client';
import { useEffect, useState } from 'react';
import { graphql } from '../generated';
import { JobStatus, PerformanceCoverage } from '../generated/graphql';
import { useJobPolling } from '../hooks/useJobPolling';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FormField } from '../components/FormField';
import { PageHeader } from '../components/PageHeader';

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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('파일을 읽지 못했습니다'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });
}

function numberText(value: number | null | undefined) {
  return value == null ? '—' : value.toLocaleString('ko-KR');
}

function funnelText(
  value: number | null | undefined,
  coverage: PerformanceCoverage,
) {
  if (coverage === PerformanceCoverage.Missing) {
    return <span className="warn-text" title="CSV에 소재 단위 값이 없습니다">소재 단위 없음</span>;
  }
  return <>{numberText(value)}{coverage === PerformanceCoverage.Partial ? ' (부분)' : ''}</>;
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
      setError(job.error ?? '브리프 생성에 실패했습니다');
      setJobId(null);
      return;
    }
    if (job?.status !== JobStatus.Succeeded) return;
    setMessage('브리프가 생성되었습니다 — 브리프 탭에서 확인');
    setJobId(null);
  }, [job?.error, job?.status]);

  async function onUpload() {
    if (!file) return;
    setError(null);
    setMessage(null);
    try {
      const result = await importCsv({
        variables: {
          input: { filename: file.name, fileBase64: await fileToBase64(file) },
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

  return (
    <section>
      <PageHeader title="성과" step="루프 6단계 — 성과·환류" description="광고 집행 결과를 배우는 곳입니다. 성과 CSV를 올리면 추적코드로 소재와 연결되어 퍼널(클릭·설치·가입)이 표시되고, 「이 성과로 브리프 생성」을 누르면 잘된 패턴이 다음 브리프에 반영되어 루프가 다시 시작됩니다." />
      <Card className="page-form-card">
        <h2>성과 CSV 업로드</h2>
        <details className="csv-guide"><summary>CSV 형식 안내</summary><p>
          CSV 헤더: date,platform,tracking_code,impressions,clicks,installs,signups,first_messages,cost,currency
        </p></details>
        <div className="page-form"><FormField label="성과 CSV" htmlFor="performance-csv"><input id="performance-csv"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          /></FormField>
        <Button variant="primary" type="button" disabled={!file || importing} onClick={() => void onUpload()}>
          성과 업로드
        </Button></div>

        {summary && (
          <div>
            <p>
              신규 {summary.importedRows}행, 갱신 {summary.updatedRows}행, 오류 {summary.errorRows}행
              {summary.duplicateFile ? ' (동일 파일 재업로드)' : ''}
            </p>
            {summary.errors.length > 0 && (
              <ul aria-label="CSV 오류">
                {summary.errors.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
              </ul>
            )}
            {summary.unmatchedTrackingCodes.length > 0 && (
              <p role="alert">
                일치하는 실험 소재가 없는 추적 코드: {summary.unmatchedTrackingCodes.join(', ')}
              </p>
            )}
          </div>
        )}
      </Card>

      <Card className="card-stack">
        <h2>퍼널 대시보드</h2>
        <FormField label="실험" htmlFor="performance-experiment"><select id="performance-experiment" value={experimentId} onChange={(event) => setExperimentId(event.target.value)}>
            <option value="">선택하세요</option>
            {experimentsData?.experiments.map((experiment) => (
              <option key={experiment.id} value={experiment.id}>{experiment.name}</option>
            ))}
          </select></FormField>

        {experimentId && (
          <>
            <div className="table-wrap"><table className="data-table">
              <thead>
                <tr>
                  <th>추적코드</th><th>훅</th><th>노출</th><th>클릭</th><th>CTR</th>
                  <th>설치</th><th>CPI</th><th>가입</th><th>첫메시지</th><th>비용</th>
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
              type="button"
              disabled={Boolean(jobId) || rows.length === 0}
              onClick={() => void onGenerateBrief()}
            >
              이 성과로 브리프 생성
            </Button>
          </>
        )}
      </Card>

      {jobId && <p>브리프 생성 중…</p>}
      {message && <p>{message}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
