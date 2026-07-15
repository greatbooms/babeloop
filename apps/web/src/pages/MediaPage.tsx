import { useMutation, useQuery } from '@apollo/client';
import { useEffect, useRef, useState } from 'react';
import { graphql } from '../generated';
import { MediaAssetKind } from '../generated/graphql';
import { useJobPolling } from '../hooks/useJobPolling';

const MediaAssetsDocument = graphql(`
  query MediaAssets {
    mediaAssets {
      id status kind originalFilename createdAt
      ocrResults { id text }
      transcriptions { id text }
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
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const job = useJobPolling(jobId);
  useEffect(() => {
    if (job?.status === 'SUCCEEDED' || job?.status === 'FAILED') void refetch();
  }, [job?.status, refetch]);

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
      setJobId(done.data!.completeMediaUpload.job.id);
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <main>
      <h1>미디어</h1>
      <div>
        <input type="file" ref={fileRef} accept="image/*,video/*" />
        <button onClick={onUpload}>업로드</button>
      </div>
      {error && <p role="alert">{error}</p>}
      {job && job.status !== 'SUCCEEDED' && job.status !== 'FAILED' && <p>분석 중… ({job.status})</p>}
      {job?.status === 'FAILED' && <p role="alert">분석 실패: {job.error}</p>}
      <ul>
        {data?.mediaAssets.map((a) => (
          <li key={a.id}>
            <strong>{a.originalFilename}</strong> — {a.status}
            {a.ocrResults.map((o) => (
              <p key={o.id}>{o.text}</p>
            ))}
            {a.transcriptions.map((tr) => (
              <p key={tr.id}>{tr.text}</p>
            ))}
          </li>
        ))}
      </ul>
    </main>
  );
}
