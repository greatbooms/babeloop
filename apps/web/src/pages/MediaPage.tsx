import { useMutation, useQuery } from '@apollo/client';
import { useRef, useState } from 'react';
import { graphql } from '../generated';
import { MediaAssetKind } from '../generated/graphql';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { PageHeader } from '../components/PageHeader';
import { HelpPanel } from '../components/HelpPanel';
import { StatusBadge } from '../components/StatusBadge';
import { Link, useNavigate } from 'react-router';

const MediaAssetsDocument = graphql(`
  query MediaAssets {
    mediaAssets(origin: MANUAL) {
      id status kind originalFilename createdAt mediaUrl thumbnailUrl
      insights { id }
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
  const { data, refetch } = useQuery(MediaAssetsDocument);
  const [requestUpload] = useMutation(RequestUploadDocument);
  const [completeUpload] = useMutation(CompleteUploadDocument);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

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

  return (
    <section className="stage-prep">
      <PageHeader title="미디어" step="보조 도구" description="내 시안·참고 미디어를 올려 텍스트를 추출하고 인사이트를 뽑는 곳. 경쟁 광고 수집과 별개 트랙" />
      <HelpPanel page="media" />
      <Card className="upload-card">
      <div className="inline-actions">
        <input type="file" ref={fileRef} accept="image/*,video/*" />
        <Button variant="primary" onClick={onUpload}>업로드</Button>
      </div>
      </Card>
      {error && <p role="alert">{error}</p>}
      <ul className="card-list">
        {data?.mediaAssets.map((a) => (
          <li key={a.id}>
            <Card className="card-stack">
            <div className="media-preview">{a.kind === MediaAssetKind.Video ? (a.thumbnailUrl ? <img src={a.thumbnailUrl} alt="" /> : <video controls src={a.mediaUrl} />) : <img src={a.mediaUrl} alt={a.originalFilename} />}</div>
            <div className="inline-actions"><strong>{a.originalFilename}</strong><StatusBadge status={a.status} /></div>
            <p className="muted">인사이트 {a.insights.length}개</p>
            <Link className="brand-detail-cta" to={`/media/${a.id}`}>상세 보기 →</Link>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
