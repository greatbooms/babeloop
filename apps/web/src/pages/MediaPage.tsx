import { useMutation, useQuery } from '@apollo/client';
import { useEffect, useRef, useState } from 'react';
import { graphql } from '../generated';
import { FormField } from '../components/FormField';
import { MediaAssetKind, MediaAssetOrigin } from '../generated/graphql';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { HelpPanel } from '../components/HelpPanel';
import { StatusBadge } from '../components/StatusBadge';
import { Link, useNavigate } from 'react-router';
import { formatDate } from '../i18n/format-date';
import { useT } from '../i18n/lang-context';
import './source-ads.css';
import './media.css';

const PAGE_SIZE = 24;

const MediaAssetsPageDocument = graphql(`
  query MediaAssetsPage($input: MediaAssetFilterInput!) {
    mediaAssetsPage(input: $input) {
      totalCount
      items {
        id status kind originalFilename createdAt mediaUrl thumbnailUrl
        insights { id }
      }
    }
  }
`);

const RequestUploadDocument = graphql(`
  mutation RequestMediaUpload($input: RequestMediaUploadInput!) {
    requestMediaUpload(input: $input) { uploadUrl mediaAsset { id } }
  }
`);

const CompleteUploadDocument = graphql(`
  mutation CompleteMediaUpload($input: CompleteMediaUploadInput!) {
    completeMediaUpload(input: $input) { mediaAsset { id status } job { id status } }
  }
`);

export function MediaPage() {
  const { lang, t } = useT();
  const [offset, setOffset] = useState(0);
  const [kind, setKind] = useState<MediaAssetKind | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  // 광고 목록과 동일: cache-and-network — 상세에서 돌아왔을 때 캐시의 빈 목록이 남지 않게 한다.
  // 폴링은 처리 중 항목이 보일 때만 3초, 평상시 30초 (원격 접속 트래픽 절감)
  const [pollFast, setPollFast] = useState(false);
  const { data } = useQuery(MediaAssetsPageDocument, {
    variables: { input: { origin: MediaAssetOrigin.Manual, offset, limit: PAGE_SIZE, kind: kind || undefined, search: search || undefined } },
    pollInterval: pollFast ? 3000 : 30_000,
    fetchPolicy: 'cache-and-network',
  });
  const [requestUpload] = useMutation(RequestUploadDocument);
  const [completeUpload] = useMutation(CompleteUploadDocument);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const items = data?.mediaAssetsPage?.items ?? [];
    setPollFast(items.some((item) => item.status === 'PENDING' || item.status === 'UPLOADED' || item.status === 'PROCESSING'));
  }, [data]);
  const navigate = useNavigate();

  useEffect(() => { const timer = window.setTimeout(() => { setOffset(0); setSearch(searchInput); }, 300); return () => window.clearTimeout(timer); }, [searchInput]);

  async function onUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const kind = file.type.startsWith('video/') ? MediaAssetKind.Video : MediaAssetKind.Image;
      const req = await requestUpload({
        variables: { input: { filename: file.name, contentType: file.type, kind } },
      });
      const { uploadUrl, mediaAsset } = req.data!.requestMediaUpload;
      const put = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      if (!put.ok) throw new Error(t('media.uploadFailed', { status: put.status }));
      const done = await completeUpload({ variables: { input: { mediaAssetId: mediaAsset.id } } });
      navigate(`/media/${done.data!.completeMediaUpload.mediaAsset.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const page = data?.mediaAssetsPage;
  const assets = page?.items ?? [];
  const total = page?.totalCount ?? 0;
  const end = Math.min(offset + PAGE_SIZE, total);
  const filtered = Boolean(kind || search);

  return (
    <section className="stage-prep">
      <PageHeader title={t('media.title')} step={t('media.step')} description={t('media.description')} actions={<Button variant="primary" size="sm" onClick={() => setUploadOpen(true)}>{t('media.uploadMedia')}</Button>} />
      <HelpPanel page="media" />
      <Modal title={t('media.uploadMedia')} open={uploadOpen} onClose={() => setUploadOpen(false)}>
        <div className="upload-zone">
          <label className="button button-secondary button-sm file-button">
            {t('media.chooseFile')}
            <input type="file" ref={fileRef} accept="image/*,video/*" onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)} />
          </label>
          <span className="form-hint">{fileName ?? t('media.chooseFileHint')}</span>
        </div>
        <Button variant="primary" disabled={!fileName} onClick={onUpload}>{t('media.upload')}</Button>
      </Modal>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="filter-bar media-filter-bar">
        <FormField label={t('media.kind')} htmlFor="media-kind"><select id="media-kind" value={kind} onChange={(event) => { setOffset(0); setKind(event.target.value as MediaAssetKind | ''); }}><option value="">{t('media.all')}</option><option value={MediaAssetKind.Image}>{t('media.image')}</option><option value={MediaAssetKind.Video}>{t('media.video')}</option></select></FormField>
        <FormField label={t('media.searchLabel')} htmlFor="media-search"><input id="media-search" type="search" placeholder={t('media.filename')} value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></FormField>
        <p className="result-count">{total === 0 ? t('media.zeroCount') : t('media.resultCount', { total, start: offset + 1, end })}</p>
      </div>
      {assets.length === 0 ? (
        <Card className="empty-state">
          <p>{filtered ? t('media.emptyFiltered') : t('media.empty')}</p>
        </Card>
      ) : (
        <ul className="ads-grid">
          {assets.map((a) => (
            <li key={a.id}>
              <Card className="ad-card">
                <Link className="ad-media" aria-label={t('media.detailAria', { filename: a.originalFilename })} to={`/media/${a.id}`}>
                  {a.kind === MediaAssetKind.Video
                    ? (a.thumbnailUrl ? <img src={a.thumbnailUrl} alt="" /> : <span>{t('media.video')}</span>)
                    : (a.mediaUrl ? <img src={a.mediaUrl} alt="" /> : <span>{t('media.image')}</span>)}
                  {a.kind === MediaAssetKind.Video && <span className="play-overlay" aria-hidden="true">▶</span>}
                  <StatusBadge status={a.status} />
                </Link>
                <div className="ad-meta">
                  <strong title={a.originalFilename}>{a.originalFilename}</strong>
                  <p>{t('media.cardMeta', { kind: a.kind === MediaAssetKind.Video ? t('media.video') : t('media.image'), count: a.insights.length })}</p>
                  <p>{t('media.uploadedAt', { date: formatDate(String(a.createdAt), lang) })}</p>
                  <Link className="brand-detail-cta" to={`/media/${a.id}`}>{t('common.detail')}</Link>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {total > PAGE_SIZE && (
        <div className="pagination">
          <Button size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>{t('common.previous')}</Button>
          <span>{Math.floor(offset / PAGE_SIZE) + 1} / {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span>
          <Button size="sm" disabled={end >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>{t('common.next')}</Button>
        </div>
      )}
    </section>
  );
}
