import { useLazyQuery, useMutation, useQuery } from '@apollo/client';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { graphql } from '../generated';
import { JobStatus, MediaAssetKind } from '../generated/graphql';
import { useJobPolling } from '../hooks/useJobPolling';

const MediaDetailDocument = graphql(`query MediaDetail($id: ID!) { mediaAsset(id: $id) { id status kind originalFilename mediaUrl thumbnailUrl ocrResults { id text } transcriptions { id text } insights { id summary hookType targetAudience emotionalTriggers genres provider model promptVersion createdAt } } }`);
const ProcessMediaDocument = graphql(`mutation DetailProcessMedia($mediaAssetId: ID!) { processMediaAsset(mediaAssetId: $mediaAssetId) { id status } }`);
const AnalyzeMediaDocument = graphql(`mutation AnalyzeMediaAsset($mediaAssetId: ID!) { analyzeMediaAsset(mediaAssetId: $mediaAssetId) { id status } }`);
const SimilarMediaAdsDocument = graphql(`query SimilarAdsForMedia($mediaAssetId: ID!, $limit: Int!) { similarAdsForMediaAsset(mediaAssetId: $mediaAssetId, limit: $limit) { similarity sourceAd { id title } } }`);

export function MediaDetailPage() {
  const { id } = useParams<{ id: string }>();
  // 업로드 직후 목록에서 넘어오면 처리 잡이 이 페이지 밖에서 끝난다 — 3초 폴링으로 추출·인사이트 결과를 따라잡는다 (미디어 URL은 fixedMediaUrl로 고정)
  const { data, refetch } = useQuery(MediaDetailDocument, { variables: { id: id! }, skip: !id, pollInterval: 3000 });
  const [processMedia] = useMutation(ProcessMediaDocument);
  const [analyzeMedia] = useMutation(AnalyzeMediaDocument);
  const [loadSimilar, similar] = useLazyQuery(SimilarMediaAdsDocument);
  const [jobId, setJobId] = useState<string | null>(null);
  const [fixedMediaUrl, setFixedMediaUrl] = useState<string | null>(null);
  const job = useJobPolling(jobId);
  useEffect(() => { if (!fixedMediaUrl && data?.mediaAsset.mediaUrl) setFixedMediaUrl(data.mediaAsset.mediaUrl); }, [data?.mediaAsset.mediaUrl, fixedMediaUrl]);
  useEffect(() => { if (job?.status === JobStatus.Succeeded || job?.status === JobStatus.Failed) { void refetch(); setJobId(null); } }, [job?.status, refetch]);
  const asset = data?.mediaAsset;
  if (!asset) return <p className="muted">미디어를 불러오는 중…</p>;
  return <section className="stage-prep">
    <Link className="back-link" to="/media">← 미디어 목록</Link>
    <header className="page-header"><div><h1>{asset.originalFilename}</h1><StatusBadge status={asset.status} /></div><div className="page-header-actions">
      <Button data-hint="이미지 글자·영상 음성을 텍스트로 추출합니다 (AI, 건당 1~2센트)" onClick={async () => setJobId((await processMedia({ variables: { mediaAssetId: asset.id } })).data!.processMediaAsset.id)}>미디어 텍스트 추출</Button>
      <Button data-hint="추출된 텍스트로 자체 인사이트를 분석합니다 (AI, 약 1센트)" onClick={async () => setJobId((await analyzeMedia({ variables: { mediaAssetId: asset.id } })).data!.analyzeMediaAsset.id)}>인사이트 분석</Button>
      <Button data-hint="비슷한 경쟁 광고를 검색합니다 (무료)" onClick={() => void loadSimilar({ variables: { mediaAssetId: asset.id, limit: 5 } })}>유사 광고</Button>
    </div></header>
    {fixedMediaUrl && <Card><div className="detail-media">{asset.kind === MediaAssetKind.Video ? <video controls src={fixedMediaUrl} /> : <img src={fixedMediaUrl} alt={asset.originalFilename} />}</div></Card>}
    <Card className="card-stack"><h2>추출 텍스트</h2>{asset.ocrResults.length === 0 && asset.transcriptions.length === 0 && <p className="muted">추출된 텍스트가 없습니다. 「미디어 텍스트 추출」을 실행해주세요.</p>}{[...asset.ocrResults, ...asset.transcriptions].map((item) => <p key={item.id}>{item.text}</p>)}</Card>
    {asset.insights.map((insight) => <Card className="card-stack" key={insight.id}><h2>{insight.summary}</h2><dl className="brand-dl"><div><dt>훅</dt><dd>{insight.hookType}</dd></div><div><dt>타깃</dt><dd>{insight.targetAudience.join(', ')}</dd></div><div><dt>감정</dt><dd>{insight.emotionalTriggers.join(', ')}</dd></div><div><dt>장르</dt><dd>{insight.genres.join(', ')}</dd></div></dl></Card>)}
    {similar.data && <Card className="card-stack"><h2>유사 경쟁 광고</h2>{similar.data.similarAdsForMediaAsset.map((hit) => <p key={hit.sourceAd.id}><Link to={`/ads/${hit.sourceAd.id}`}>{hit.sourceAd.title ?? hit.sourceAd.id}</Link> · 유사도 {hit.similarity.toFixed(2)}</p>)}</Card>}
  </section>;
}
