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
import { formatDate } from '../i18n/format-date';
import { useT } from '../i18n/lang-context';
import './source-ads.css';

const PAGE_SIZE = 24;

const SourceAdCountriesDocument = graphql(`query SourceAdCountries { sourceAdCountries }`);
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

function fileAsDataUrl(file: File, readError: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error(readError));
    reader.readAsDataURL(file);
  });
}

export function SourceAdsPage() {
  const { lang, t } = useT();
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState<SourceAdStatus | ''>('');
  const [kind, setKind] = useState<MediaAssetKind | ''>('');
  const [country, setCountry] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  // 분석→임베딩 체인이 잡 폴링 종료 후에도 상태를 바꾸므로 목록을 폴링하되,
  // 진행 중(잡 활성·ANALYZING 항목)일 때만 3초, 평상시엔 30초로 줄인다 (원격 접속 트래픽 절감)
  const [pollFast, setPollFast] = useState(false);
  const { data, refetch } = useQuery(SourceAdsPageDocument, {
    variables: { input: { offset, limit: PAGE_SIZE, status: status || undefined, kind: kind || undefined, search: search || undefined, country: country || undefined } },
    pollInterval: pollFast ? 3000 : 30_000,
  });
  const { data: countriesData } = useQuery(SourceAdCountriesDocument);
  const [createSourceAd] = useMutation(CreateSourceAdDocument);
  const [importCsv] = useMutation(ImportCsvDocument);
  const [title, setTitle] = useState('');
  const [adText, setAdText] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [registerOpen, setRegisterOpen] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const job = useJobPolling(jobId);
  useEffect(() => {
    const items = data?.sourceAdsPage?.items ?? [];
    setPollFast(Boolean(jobId) || items.some((item) => item.status === 'ANALYZING'));
  }, [data, jobId]);

  useEffect(() => { const timer = window.setTimeout(() => { setOffset(0); setSearch(searchInput); }, 300); return () => window.clearTimeout(timer); }, [searchInput]);
  useEffect(() => { if (job?.status !== 'SUCCEEDED' && job?.status !== 'FAILED') return; void refetch(); const timer = window.setTimeout(() => void refetch(), 2000); return () => window.clearTimeout(timer); }, [job?.status, refetch]);

  async function run(action: () => Promise<string | null>) {
    setError(null);
    setBusy(true);
    try { setJobId(await action()); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); }
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
    setBusy(true);
    try {
      const fileBase64 = (await fileAsDataUrl(file, t('ads.fileReadFailed'))).split(',', 2)[1] ?? '';
      const result = await importCsv({ variables: { input: { fileBase64 } } });
      const imported = result.data!.importSensorTowerCsv;
      setMessage(t('ads.importSummary', { imported: imported.importedCount, duplicates: imported.duplicateCount }));
      if (imported.errors.length) setError(imported.errors.join('\n'));
      setOffset(0); await refetch();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { event.target.value = ''; setBusy(false); }
  }

  const page = data?.sourceAdsPage;
  const total = page?.totalCount ?? 0;
  const end = Math.min(offset + PAGE_SIZE, total);
  const dateLabel = (value: unknown) => value ? formatDate(String(value), lang) : t('ads.noDate');

  return (
    <section className="stage-collect">
      <PageHeader title={t('ads.title')} step={t('ads.step')} description={t('ads.description')} actions={<>
        <label className={`file-button button button-secondary button-sm${busy ? ' actions-locked' : ''}`}>{busy ? t('ads.importing') : t('ads.csvImport')}<input type="file" accept=".csv" disabled={busy} onChange={onImport} aria-label="Sensor Tower CSV" /></label>
        <Button variant="primary" size="sm" onClick={() => setRegisterOpen(true)}>{t('ads.newAd')}</Button>
      </>} />
      <HelpPanel page="ads" />
      <Modal title={t('ads.manualRegister')} open={registerOpen} onClose={() => setRegisterOpen(false)}>
        <FormField label={t('ads.adTitle')} htmlFor="source-ad-title"><input id="source-ad-title" value={title} onChange={(event) => setTitle(event.target.value)} /></FormField>
        <FormField label={t('ads.adCopy')} htmlFor="source-ad-text"><textarea id="source-ad-text" value={adText} onChange={(event) => setAdText(event.target.value)} /></FormField>
        <FormField label={t('ads.sourceUrl')} htmlFor="source-ad-url"><input id="source-ad-url" type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} /></FormField>
        <Button variant="primary" disabled={busy} onClick={() => void onCreate()}>{t('ads.register')}</Button>
      </Modal>
      <div className="ads-content">
          <div className="filter-bar">
            <FormField label={t('ads.status')} htmlFor="ad-status"><select id="ad-status" value={status} onChange={(event) => { setOffset(0); setStatus(event.target.value as SourceAdStatus | ''); }}><option value="">{t('ads.all')}</option>{Object.values(SourceAdStatus).map((value) => <option key={value} value={value}>{STATUS_LABELS[value]?.[lang] ?? value}</option>)}</select></FormField>
            <FormField label={t('ads.kind')} htmlFor="ad-kind"><select id="ad-kind" value={kind} onChange={(event) => { setOffset(0); setKind(event.target.value as MediaAssetKind | ''); }}><option value="">{t('ads.all')}</option><option value={MediaAssetKind.Image}>{t('ads.image')}</option><option value={MediaAssetKind.Video}>{t('ads.video')}</option></select></FormField>
            <FormField label={t('ads.country')} htmlFor="ad-country"><select id="ad-country" value={country} onChange={(event) => { setOffset(0); setCountry(event.target.value); }}><option value="">{t('ads.all')}</option>{(countriesData?.sourceAdCountries ?? []).map((code) => <option key={code} value={code}>{code}</option>)}</select></FormField>
            <FormField label={t('ads.search')} htmlFor="ad-search"><input id="ad-search" type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></FormField>
            <p className="result-count">{total === 0 ? t('ads.zeroCount') : t('ads.resultCount', { total, start: offset + 1, end })}</p>
          </div>
          {busy && <div className="job-banner" role="status"><span className="job-banner-spinner" aria-hidden="true" /><span>{t('ads.importingBanner')}</span></div>}
          {message && <p className="notice">{message}</p>}
          {error && <p className="error" role="alert">{error}</p>}
          {job && job.status !== 'SUCCEEDED' && job.status !== 'FAILED' && <p>{t('ads.analyzing', { status: job.status })}</p>}
          <ul className="ads-grid">
            {page?.items.map((ad) => (
              <li key={ad.id}>
                <Card className="ad-card">
                  <Link className="ad-media" aria-label={t('ads.detailAria', { title: ad.title ?? t('ads.ad') })} to={`/ads/${ad.id}`}>
                    {ad.mediaAsset?.thumbnailUrl ? <img src={ad.mediaAsset.thumbnailUrl} alt="" /> : <span>{ad.mediaAsset?.kind === MediaAssetKind.Video ? t('ads.video') : t('ads.noImage')}</span>}
                    {ad.mediaAsset?.kind === MediaAssetKind.Video && <span className="play-overlay" aria-hidden="true">▶</span>}
                    <StatusBadge status={ad.status} />
                  </Link>
                  <div className="ad-meta">
                    <strong title={ad.title ?? ad.adText ?? ad.id}>{ad.competitor?.name ? `${ad.competitor.name} · ` : ''}{ad.title ?? ad.adText ?? ad.id}</strong>
                    <p>{[...ad.networks, ...ad.countries].join(' · ') || t('ads.noNetworkCountry')}</p>
                    <p>{dateLabel(ad.firstSeenAt)} ~ {dateLabel(ad.lastSeenAt)}</p>
                    <Link className="brand-detail-cta" to={`/ads/${ad.id}`}>{t('common.detail')}</Link>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
          <div className="pagination"><Button size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>{t('common.previous')}</Button><span>{Math.floor(offset / PAGE_SIZE) + 1} / {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span><Button size="sm" disabled={end >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>{t('common.next')}</Button></div>
      </div>
    </section>
  );
}
