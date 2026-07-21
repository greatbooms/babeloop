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

function dateLabel(value: unknown) {
  return value ? new Intl.DateTimeFormat('ko-KR').format(new Date(String(value))) : '';
}

export function MediaPage() {
  const [offset, setOffset] = useState(0);
  const [kind, setKind] = useState<MediaAssetKind | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  // 광고 목록과 동일: 3초 폴링 + cache-and-network — 상세에서 돌아왔을 때 캐시의 빈 목록이 남지 않게 한다
  const { data } = useQuery(MediaAssetsPageDocument, {
    variables: { input: { origin: MediaAssetOrigin.Manual, offset, limit: PAGE_SIZE, kind: kind || undefined, search: search || undefined } },
    pollInterval: 3000,
    fetchPolicy: 'cache-and-network',
  });
  const [requestUpload] = useMutation(RequestUploadDocument);
  const [completeUpload] = useMutation(CompleteUploadDocument);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
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
      if (!put.ok) throw new Error(`업로드 실패: HTTP ${put.status}`);
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
      <PageHeader title="미디어" step="보조 도구" description="내 시안·참고 미디어를 올려 텍스트를 추출하고 인사이트를 뽑는 곳. 경쟁 광고 수집과 별개 트랙" actions={<Button variant="primary" size="sm" onClick={() => setUploadOpen(true)}>미디어 업로드</Button>} />
      <HelpPanel page="media" />
      <Modal title="미디어 업로드" open={uploadOpen} onClose={() => setUploadOpen(false)}>
        <div className="upload-zone">
          <label className="button button-secondary button-sm file-button">
            파일 선택
            <input type="file" ref={fileRef} accept="image/*,video/*" onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)} />
          </label>
          <span className="form-hint">{fileName ?? '이미지 또는 영상 파일을 선택하세요'}</span>
        </div>
        <Button variant="primary" disabled={!fileName} onClick={onUpload}>업로드</Button>
      </Modal>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="filter-bar media-filter-bar">
        <FormField label="종류" htmlFor="media-kind"><select id="media-kind" value={kind} onChange={(event) => { setOffset(0); setKind(event.target.value as MediaAssetKind | ''); }}><option value="">전체</option><option value={MediaAssetKind.Image}>이미지</option><option value={MediaAssetKind.Video}>영상</option></select></FormField>
        <FormField label="검색" htmlFor="media-search"><input id="media-search" type="search" placeholder="파일명" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></FormField>
        <p className="result-count">{total === 0 ? '0건' : `${total}건 중 ${offset + 1}–${end}`}</p>
      </div>
      {assets.length === 0 ? (
        <Card className="empty-state">
          <p>{filtered ? '조건에 맞는 미디어가 없습니다.' : '아직 올린 미디어가 없습니다. 시안이나 참고 이미지·영상을 올려 인사이트를 확인해보세요.'}</p>
        </Card>
      ) : (
        <ul className="ads-grid">
          {assets.map((a) => (
            <li key={a.id}>
              <Card className="ad-card">
                <Link className="ad-media" aria-label={`${a.originalFilename} 상세 보기`} to={`/media/${a.id}`}>
                  {a.kind === MediaAssetKind.Video
                    ? (a.thumbnailUrl ? <img src={a.thumbnailUrl} alt="" /> : <span>영상</span>)
                    : (a.mediaUrl ? <img src={a.mediaUrl} alt="" /> : <span>이미지</span>)}
                  {a.kind === MediaAssetKind.Video && <span className="play-overlay" aria-hidden="true">▶</span>}
                  <StatusBadge status={a.status} />
                </Link>
                <div className="ad-meta">
                  <strong title={a.originalFilename}>{a.originalFilename}</strong>
                  <p>{a.kind === MediaAssetKind.Video ? '영상' : '이미지'} · 인사이트 {a.insights.length}개</p>
                  <p>{dateLabel(a.createdAt)} 업로드</p>
                  <Link className="brand-detail-cta" to={`/media/${a.id}`}>상세 보기 →</Link>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {total > PAGE_SIZE && (
        <div className="pagination">
          <Button size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>이전</Button>
          <span>{Math.floor(offset / PAGE_SIZE) + 1} / {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span>
          <Button size="sm" disabled={end >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>다음</Button>
        </div>
      )}
    </section>
  );
}
