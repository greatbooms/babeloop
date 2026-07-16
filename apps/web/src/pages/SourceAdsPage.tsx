import { useLazyQuery, useMutation, useQuery } from '@apollo/client';
import { ChangeEvent, useEffect, useState } from 'react';
import { graphql } from '../generated';
import { useJobPolling } from '../hooks/useJobPolling';

const SourceAdsDocument = graphql(`
  query SourceAds {
    sourceAds {
      id status title adText origin createdAt
      latestAnalysis { id summary hookType genres }
    }
  }
`);

const CreateSourceAdDocument = graphql(`
  mutation CreateSourceAd($input: CreateSourceAdInput!) {
    createSourceAd(input: $input) { sourceAd { id } job { id } }
  }
`);

const ImportCsvDocument = graphql(`
  mutation ImportCsv($input: ImportSensorTowerCsvInput!) {
    importSensorTowerCsv(input: $input) { importedCount duplicateCount errors }
  }
`);

const SimilarDocument = graphql(`
  query Similar($input: SimilarSourceAdsInput!) {
    similarSourceAds(input: $input) { similarity sourceAd { id title adText } }
  }
`);

function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('파일 읽기 실패'));
    reader.readAsDataURL(file);
  });
}

export function SourceAdsPage() {
  const { data, refetch } = useQuery(SourceAdsDocument);
  const [createSourceAd] = useMutation(CreateSourceAdDocument);
  const [importCsv] = useMutation(ImportCsvDocument);
  const [loadSimilar, similarQuery] = useLazyQuery(SimilarDocument);
  const [title, setTitle] = useState('');
  const [adText, setAdText] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [selectedAdId, setSelectedAdId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const job = useJobPolling(jobId);

  useEffect(() => {
    if (job?.status !== 'SUCCEEDED' && job?.status !== 'FAILED') return;
    void refetch();
    const timer = window.setTimeout(() => void refetch(), 2000);
    return () => window.clearTimeout(timer);
  }, [job?.status, refetch]);

  async function onCreate() {
    setError(null);
    setMessage(null);
    try {
      const result = await createSourceAd({
        variables: {
          input: {
            title: title || undefined,
            adText: adText || undefined,
            sourceUrl: sourceUrl || undefined,
          },
        },
      });
      setJobId(result.data!.createSourceAd.job?.id ?? null);
      setTitle('');
      setAdText('');
      setSourceUrl('');
      await refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function onImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setMessage(null);
    try {
      const dataUrl = await fileAsDataUrl(file);
      const fileBase64 = dataUrl.split(',', 2)[1] ?? '';
      const result = await importCsv({ variables: { input: { fileBase64 } } });
      const imported = result.data!.importSensorTowerCsv;
      setMessage(`${imported.importedCount}건 임포트, ${imported.duplicateCount}건 중복`);
      if (imported.errors.length > 0) setError(imported.errors.join('\n'));
      await refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      event.target.value = '';
    }
  }

  async function onSimilar(sourceAdId: string) {
    setSelectedAdId(sourceAdId);
    setError(null);
    try {
      await loadSimilar({ variables: { input: { sourceAdId, limit: 5 } } });
    } catch (cause) {
      const code = (cause as { graphQLErrors?: Array<{ extensions?: { code?: string } }> }).graphQLErrors?.[0]
        ?.extensions?.code;
      setError(
        code === 'EMBEDDING_NOT_READY'
          ? '분석이 끝나면 검색할 수 있습니다'
          : cause instanceof Error
            ? cause.message
            : String(cause),
      );
    }
  }

  return (
    <main>
      <h1>광고</h1>

      <section>
        <h2>광고 등록</h2>
        <label>
          제목
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          광고 문구
          <textarea value={adText} onChange={(event) => setAdText(event.target.value)} />
        </label>
        <label>
          소스 URL
          <input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} />
        </label>
        <button onClick={onCreate}>광고 등록</button>
      </section>

      <section>
        <h2>Sensor Tower CSV 임포트</h2>
        <input type="file" accept=".csv" onChange={onImport} aria-label="Sensor Tower CSV" />
        {message && <p>{message}</p>}
      </section>

      {error && <p role="alert">{error}</p>}
      {job && job.status !== 'SUCCEEDED' && job.status !== 'FAILED' && <p>분석 중… ({job.status})</p>}

      <ul>
        {data?.sourceAds.map((ad) => (
          <li key={ad.id}>
            <strong>{ad.title ?? ad.adText ?? ad.id}</strong> — <span>{ad.status}</span>
            {ad.adText && <p>{ad.adText}</p>}
            {ad.latestAnalysis && (
              <div>
                <p>{ad.latestAnalysis.summary}</p>
                <p>훅: {ad.latestAnalysis.hookType} / 장르: {ad.latestAnalysis.genres.join(', ')}</p>
              </div>
            )}
            <button onClick={() => void onSimilar(ad.id)}>유사 광고</button>
            {selectedAdId === ad.id && similarQuery.loading && <p>검색 중…</p>}
            {selectedAdId === ad.id && similarQuery.data && (
              <ul>
                {similarQuery.data.similarSourceAds.map((similar) => (
                  <li key={similar.sourceAd.id}>
                    {similar.similarity.toFixed(2)} — {similar.sourceAd.title ?? similar.sourceAd.adText ?? similar.sourceAd.id}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
