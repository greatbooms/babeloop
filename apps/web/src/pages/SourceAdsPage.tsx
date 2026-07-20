import { useLazyQuery, useMutation, useQuery } from '@apollo/client';
import { type ChangeEvent, useEffect, useState } from 'react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FormField } from '../components/FormField';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { graphql } from '../generated';
import { MediaAssetKind, SourceAdStatus } from '../generated/graphql';
import { useJobPolling } from '../hooks/useJobPolling';
import { STATUS_LABELS } from '../lib/status-labels';
import './source-ads.css';

const PAGE_SIZE = 24;

const SourceAdsPageDocument = graphql(`
  query SourceAdsPage($input: SourceAdFilterInput!) {
    sourceAdsPage(input: $input) {
      totalCount
      items {
        id status title adText origin sourceUrl networks countries firstSeenAt lastSeenAt createdAt
        competitor { id name }
        mediaAsset { id status kind thumbnailUrl }
        latestAnalysis { id summary hookType genres }
      }
    }
  }
`);

const CreateSourceAdDocument = graphql(`mutation CreateSourceAd($input: CreateSourceAdInput!) { createSourceAd(input: $input) { sourceAd { id } job { id } } }`);
const ImportCsvDocument = graphql(`mutation ImportCsv($input: ImportSensorTowerCsvInput!) { importSensorTowerCsv(input: $input) { importedCount duplicateCount errors } }`);
const SimilarDocument = graphql(`query Similar($input: SimilarSourceAdsInput!) { similarSourceAds(input: $input) { similarity sourceAd { id title adText } } }`);
const ProcessMediaAssetDocument = graphql(`mutation ProcessMediaAsset($mediaAssetId: ID!) { processMediaAsset(mediaAssetId: $mediaAssetId) { id status } }`);
const AnalyzeSourceAdDocument = graphql(`mutation AnalyzeSourceAd($input: AnalyzeSourceAdInput!) { analyzeSourceAd(input: $input) { id status } }`);
const RedownloadMediaDocument = graphql(`mutation RedownloadSourceAdMedia($sourceAdId: ID!) { redownloadSourceAdMedia(sourceAdId: $sourceAdId) { id status } }`);

function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('파일 읽기 실패'));
    reader.readAsDataURL(file);
  });
}

function dateLabel(value: unknown) {
  return value ? new Intl.DateTimeFormat('ko-KR').format(new Date(String(value))) : '날짜 없음';
}

export function SourceAdsPage() {
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState<SourceAdStatus | ''>('');
  const [kind, setKind] = useState<MediaAssetKind | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  // 분석→임베딩 체인이 잡 폴링 종료 후에도 상태를 바꾸므로 목록은 상시 폴링한다 (BriefsPage와 동일 근거)
  const { data, refetch } = useQuery(SourceAdsPageDocument, {
    variables: { input: { offset, limit: PAGE_SIZE, status: status || undefined, kind: kind || undefined, search: search || undefined } },
    pollInterval: 3000,
  });
  const [createSourceAd] = useMutation(CreateSourceAdDocument);
  const [importCsv] = useMutation(ImportCsvDocument);
  const [processMediaAsset] = useMutation(ProcessMediaAssetDocument);
  const [analyzeSourceAd] = useMutation(AnalyzeSourceAdDocument);
  const [redownloadMedia] = useMutation(RedownloadMediaDocument);
  const [loadSimilar, similarQuery] = useLazyQuery(SimilarDocument);
  const [title, setTitle] = useState('');
  const [adText, setAdText] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [selectedAdId, setSelectedAdId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const job = useJobPolling(jobId);

  useEffect(() => { const timer = window.setTimeout(() => { setOffset(0); setSearch(searchInput); }, 300); return () => window.clearTimeout(timer); }, [searchInput]);
  useEffect(() => { if (job?.status !== 'SUCCEEDED' && job?.status !== 'FAILED') return; void refetch(); const timer = window.setTimeout(() => void refetch(), 2000); return () => window.clearTimeout(timer); }, [job?.status, refetch]);

  async function run(action: () => Promise<string | null>) {
    setError(null);
    try { setJobId(await action()); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

  async function onCreate() {
    setMessage(null);
    await run(async () => {
      const result = await createSourceAd({ variables: { input: { title: title || undefined, adText: adText || undefined, sourceUrl: sourceUrl || undefined } } });
      setTitle(''); setAdText(''); setSourceUrl(''); setOffset(0); await refetch();
      return result.data!.createSourceAd.job?.id ?? null;
    });
  }

  async function onImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    setError(null); setMessage(null);
    try {
      const fileBase64 = (await fileAsDataUrl(file)).split(',', 2)[1] ?? '';
      const result = await importCsv({ variables: { input: { fileBase64 } } });
      const imported = result.data!.importSensorTowerCsv;
      setMessage(`${imported.importedCount}건 임포트, ${imported.duplicateCount}건 중복`);
      if (imported.errors.length) setError(imported.errors.join('\n'));
      setOffset(0); await refetch();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { event.target.value = ''; }
  }

  async function onSimilar(sourceAdId: string) {
    setSelectedAdId(sourceAdId); setError(null);
    try { await loadSimilar({ variables: { input: { sourceAdId, limit: 5 } } }); }
    catch (cause) {
      const code = (cause as { graphQLErrors?: Array<{ extensions?: { code?: string } }> }).graphQLErrors?.[0]?.extensions?.code;
      setError(code === 'EMBEDDING_NOT_READY' ? '분석이 끝나면 검색할 수 있습니다' : cause instanceof Error ? cause.message : String(cause));
    }
  }

  const page = data?.sourceAdsPage;
  const total = page?.totalCount ?? 0;
  const end = Math.min(offset + PAGE_SIZE, total);

  return (
    <section>
      <PageHeader title="광고" description="경쟁사 광고를 수집하고 분석합니다. 필터로 필요한 소재를 찾고 분석 결과를 비교하세요." actions={<label className="file-button button button-secondary button-sm">CSV 임포트<input type="file" accept=".csv" onChange={onImport} aria-label="Sensor Tower CSV" /></label>} />
      <div className="ads-registration-layout">
        <Card className="ad-registration-card">
          <h2>광고 수동 등록</h2>
          <FormField label="제목" htmlFor="source-ad-title"><input id="source-ad-title" value={title} onChange={(event) => setTitle(event.target.value)} /></FormField>
          <FormField label="광고 문구" htmlFor="source-ad-text"><textarea id="source-ad-text" value={adText} onChange={(event) => setAdText(event.target.value)} /></FormField>
          <FormField label="소스 URL" htmlFor="source-ad-url"><input id="source-ad-url" type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} /></FormField>
          <Button variant="primary" onClick={() => void onCreate()}>광고 등록</Button>
        </Card>
        <div className="ads-content">
          <div className="filter-bar">
            <FormField label="상태" htmlFor="ad-status"><select id="ad-status" value={status} onChange={(event) => { setOffset(0); setStatus(event.target.value as SourceAdStatus | ''); }}><option value="">전체</option>{Object.values(SourceAdStatus).map((value) => <option key={value} value={value}>{STATUS_LABELS[value]?.ko ?? value}</option>)}</select></FormField>
            <FormField label="종류" htmlFor="ad-kind"><select id="ad-kind" value={kind} onChange={(event) => { setOffset(0); setKind(event.target.value as MediaAssetKind | ''); }}><option value="">전체</option><option value={MediaAssetKind.Image}>이미지</option><option value={MediaAssetKind.Video}>영상</option></select></FormField>
            <FormField label="검색" htmlFor="ad-search"><input id="ad-search" type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></FormField>
            <p className="result-count">{total === 0 ? '0건' : `${total}건 중 ${offset + 1}–${end}`}</p>
          </div>
          {message && <p className="notice">{message}</p>}
          {error && <p className="error" role="alert">{error}</p>}
          {job && job.status !== 'SUCCEEDED' && job.status !== 'FAILED' && <p>분석 중… ({job.status})</p>}
          <ul className="ads-grid">
            {page?.items.map((ad) => (
              <li key={ad.id}>
                <Card className="ad-card">
                  <div className="ad-media">
                    {ad.mediaAsset?.thumbnailUrl ? <img src={ad.mediaAsset.thumbnailUrl} alt="" /> : <span>{ad.mediaAsset?.kind === MediaAssetKind.Video ? '영상' : '이미지 없음'}</span>}
                    <StatusBadge status={ad.status} />
                  </div>
                  <div className="ad-meta">
                    <strong title={ad.title ?? ad.adText ?? ad.id}>{ad.competitor?.name ? `${ad.competitor.name} · ` : ''}{ad.title ?? ad.adText ?? ad.id}</strong>
                    <p>{[...ad.networks, ...ad.countries].join(' · ') || '네트워크·국가 정보 없음'}</p>
                    <p>{dateLabel(ad.firstSeenAt)} ~ {dateLabel(ad.lastSeenAt)}</p>
                    {ad.adText && <p className="ad-copy">{ad.adText}</p>}
                    {ad.latestAnalysis && <p className="hook-line">훅: {ad.latestAnalysis.hookType}</p>}
                  </div>
                  <div className="ad-actions">
                    {ad.mediaAsset && <><Button size="sm" onClick={() => void run(async () => (await processMediaAsset({ variables: { mediaAssetId: ad.mediaAsset!.id } })).data!.processMediaAsset.id)}>미디어 텍스트 추출</Button><Button size="sm" onClick={() => void run(async () => (await analyzeSourceAd({ variables: { input: { sourceAdId: ad.id } } })).data!.analyzeSourceAd.id)}>광고 분석</Button></>}
                    {ad.sourceUrl && <Button size="sm" onClick={() => void run(async () => (await redownloadMedia({ variables: { sourceAdId: ad.id } })).data!.redownloadSourceAdMedia.id)}>재다운로드</Button>}
                    <Button size="sm" onClick={() => void onSimilar(ad.id)}>유사 광고</Button>
                  </div>
                  {selectedAdId === ad.id && similarQuery.loading && <p>검색 중…</p>}
                  {selectedAdId === ad.id && similarQuery.data && <ul className="similar-list">{similarQuery.data.similarSourceAds.map((similar) => <li key={similar.sourceAd.id}>{similar.similarity.toFixed(2)} — {similar.sourceAd.title ?? similar.sourceAd.adText ?? similar.sourceAd.id}</li>)}</ul>}
                </Card>
              </li>
            ))}
          </ul>
          <div className="pagination"><Button size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>이전</Button><span>{Math.floor(offset / PAGE_SIZE) + 1} / {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span><Button size="sm" disabled={end >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>다음</Button></div>
        </div>
      </div>
    </section>
  );
}
