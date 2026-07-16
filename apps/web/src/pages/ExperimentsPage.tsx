import { useMutation, useQuery } from '@apollo/client';
import { FormEvent, useState } from 'react';
import { graphql } from '../generated';

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
    <main>
      <h1>실험</h1>
      <form onSubmit={onCreate}>
        <label>
          실험 코드
          <input required value={code} onChange={(event) => setCode(event.target.value)} />
        </label>
        <label>
          실험 이름
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <button type="submit">실험 생성</button>
      </form>
      {error && <p role="alert">{error}</p>}
      <ul>
        {data?.experiments.map((experiment) => {
          const exported = exportsByExperiment[experiment.id];
          return (
            <li key={experiment.id}>
              <h2>{experiment.name}</h2>
              <p>{experiment.code} · {experiment.marketCode}</p>
              <ul>
                {experiment.variants.map((variant) => (
                  <li key={variant.id}>
                    {variant.variantCode} · {variant.trackingCode} ·{' '}
                    {variant.creative.koreanText.slice(0, 100)}
                  </li>
                ))}
              </ul>
              <button onClick={() => void onExport(experiment.id)}>내보내기</button>
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
            </li>
          );
        })}
      </ul>
    </main>
  );
}
