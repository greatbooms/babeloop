import { useMutation, useQuery } from '@apollo/client';
import { type ChangeEvent, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../components/Button';
import { FormField } from '../components/FormField';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { HelpPanel } from '../components/HelpPanel';
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
      }
    }
  }
`);

const CreateSourceAdDocument = graphql(`mutation CreateSourceAd($input: CreateSourceAdInput!) { createSourceAd(input: $input) { sourceAd { id } job { id } } }`);
const ImportCsvDocument = graphql(`mutation ImportCsv($input: ImportSensorTowerCsvInput!) { importSensorTowerCsv(input: $input) { importedCount duplicateCount errors } }`);

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
  const [title, setTitle] = useState('');
  const [adText, setAdText] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [registerOpen, setRegisterOpen] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
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
      setTitle(''); setAdText(''); setSourceUrl(''); setOffset(0); setRegisterOpen(false); await refetch();
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

  const page = data?.sourceAdsPage;
  const total = page?.totalCount ?? 0;
  const end = Math.min(offset + PAGE_SIZE, total);

  return (
    <section className="stage-collect">
      <PageHeader title="광고" step="루프 1·2단계 — 수집·분석" description="경쟁사 광고를 모으고 분석하는 루프의 시작점입니다. Sensor Tower CSV 임포트 또는 수동 등록 → 미디어 텍스트 추출 → 광고 분석 → 유사 광고 비교 순서로 진행하세요." actions={<>
        <label className="file-button button button-secondary button-sm">CSV 임포트<input type="file" accept=".csv" onChange={onImport} aria-label="Sensor Tower CSV" /></label>
        <Button variant="primary" size="sm" onClick={() => setRegisterOpen(true)}>새 광고 등록</Button>
      </>} />
      <HelpPanel page="ads" />
      <Modal title="광고 수동 등록" open={registerOpen} onClose={() => setRegisterOpen(false)}>
        <FormField label="제목" htmlFor="source-ad-title"><input id="source-ad-title" value={title} onChange={(event) => setTitle(event.target.value)} /></FormField>
        <FormField label="광고 문구" htmlFor="source-ad-text"><textarea id="source-ad-text" value={adText} onChange={(event) => setAdText(event.target.value)} /></FormField>
        <FormField label="소스 URL" htmlFor="source-ad-url"><input id="source-ad-url" type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} /></FormField>
        <Button variant="primary" onClick={() => void onCreate()}>광고 등록</Button>
      </Modal>
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
                  <Link className="ad-media" aria-label={`${ad.title ?? '광고'} 상세 보기`} to={`/ads/${ad.id}`}>
                    {ad.mediaAsset?.thumbnailUrl ? <img src={ad.mediaAsset.thumbnailUrl} alt="" /> : <span>{ad.mediaAsset?.kind === MediaAssetKind.Video ? '영상' : '이미지 없음'}</span>}
                    {ad.mediaAsset?.kind === MediaAssetKind.Video && <span className="play-overlay" aria-hidden="true">▶</span>}
                    <StatusBadge status={ad.status} />
                  </Link>
                  <div className="ad-meta">
                    <strong title={ad.title ?? ad.adText ?? ad.id}>{ad.competitor?.name ? `${ad.competitor.name} · ` : ''}{ad.title ?? ad.adText ?? ad.id}</strong>
                    <p>{[...ad.networks, ...ad.countries].join(' · ') || '네트워크·국가 정보 없음'}</p>
                    <p>{dateLabel(ad.firstSeenAt)} ~ {dateLabel(ad.lastSeenAt)}</p>
                    <Link className="brand-detail-cta" to={`/ads/${ad.id}`}>상세 보기 →</Link>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
          <div className="pagination"><Button size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>이전</Button><span>{Math.floor(offset / PAGE_SIZE) + 1} / {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span><Button size="sm" disabled={end >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>다음</Button></div>
      </div>
    </section>
  );
}
