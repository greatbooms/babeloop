import { useMutation, useQuery } from '@apollo/client';
import { FormEvent, useState } from 'react';
import { graphql } from '../generated';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FormField } from '../components/FormField';
import { PageHeader } from '../components/PageHeader';

const ExperimentsPageDocument = graphql(`
  query ExperimentsPage {
    experiments {
      id code name marketCode createdAt
      variants {
        id variantCode trackingCode
        creative { id koreanText status }
      }
    }
  }
`);

const CreateExperimentDocument = graphql(`
  mutation ExperimentsCreate($input: CreateExperimentInput!) {
    createExperiment(input: $input) { id code name }
  }
`);

const ExportExperimentDocument = graphql(`
  mutation ExperimentsExport($input: ExportExperimentInput!) {
    exportExperiment(input: $input) {
      package { id }
      files { trackingCode filename url }
      manifestUrl
    }
  }
`);

interface ExportView {
  files: Array<{ trackingCode: string; filename: string; url: string }>;
  manifestUrl: string;
}

export function ExperimentsPage() {
  const { data, refetch } = useQuery(ExperimentsPageDocument);
  const [createExperiment] = useMutation(CreateExperimentDocument);
  const [exportExperiment] = useMutation(ExportExperimentDocument);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [exportsByExperiment, setExportsByExperiment] = useState<Record<string, ExportView>>({});
  const [error, setError] = useState<string | null>(null);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await createExperiment({ variables: { input: { code, name } } });
      setCode('');
      setName('');
      await refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function onExport(experimentId: string) {
    setError(null);
    try {
      const result = await exportExperiment({ variables: { input: { experimentId } } });
      setExportsByExperiment((current) => ({
        ...current,
        [experimentId]: result.data!.exportExperiment,
      }));
      await refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <section>
      <PageHeader title="실험" step="루프 5단계 — 내보내기" description="승인된 문구를 실험 단위로 묶어 광고로 내보내는 곳입니다. 실험 생성 → 검토 탭에서 승인 문구를 실험에 추가 → 내보내기를 누르면 추적코드(BL-…)가 각인된 집행용 파일을 받습니다. 이 코드가 나중에 성과를 소재별로 연결합니다." />
      <Card className="page-form-card"><form className="page-form" onSubmit={onCreate}>
        <FormField label="실험 코드" htmlFor="experiment-code"><input id="experiment-code" required value={code} onChange={(event) => setCode(event.target.value)} /></FormField>
        <FormField label="실험 이름" htmlFor="experiment-name"><input id="experiment-name" required value={name} onChange={(event) => setName(event.target.value)} /></FormField>
        <Button variant="primary" type="submit">실험 생성</Button>
      </form>
      </Card>
      {error && <p role="alert">{error}</p>}
      <ul className="card-list">
        {data?.experiments.map((experiment) => {
          const exported = exportsByExperiment[experiment.id];
          return (
            <li key={experiment.id}>
              <Card className="card-stack">
              <span className="experiment-code">{experiment.code}</span>
              <h2>{experiment.name}</h2>
              <p className="muted">{experiment.marketCode}</p>
              <div className="table-wrap"><table className="data-table"><thead><tr><th>변형코드</th><th>추적코드</th><th>문구 요약</th></tr></thead><tbody>
                {experiment.variants.map((variant) => (
                  <tr key={variant.id}><td>{variant.variantCode}</td><td>{variant.trackingCode}</td><td>{variant.creative.koreanText.slice(0, 100)}</td></tr>
                ))}
              </tbody></table></div>
              <Button onClick={() => void onExport(experiment.id)}>내보내기</Button>
              {exported && (
                <div>
                  {exported.files.map((file) => (
                    <p key={file.trackingCode}>
                      <a href={file.url}>{file.filename}</a>
                    </p>
                  ))}
                  <p><a href={exported.manifestUrl}>manifest.csv</a></p>
                </div>
              )}
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
