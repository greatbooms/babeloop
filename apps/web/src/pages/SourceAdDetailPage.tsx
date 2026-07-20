import { useLazyQuery, useMutation, useQuery } from '@apollo/client';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { graphql } from '../generated';
import { MediaAssetKind } from '../generated/graphql';
import { useJobPolling } from '../hooks/useJobPolling';
import './source-ads.css';

const SourceAdDocument = graphql(`
  query SourceAdDetail($id: ID!) {
    sourceAd(id: $id) {
      id status title adText origin sourceUrl networks countries firstSeenAt lastSeenAt provider confidence
      competitor { id name }
      mediaAsset { id kind mediaUrl ocrResults { id text } transcriptions { id text language } }
      latestAnalysis { id summary hookType targetAudience emotionalTriggers genres }
      referencingBriefs { id title }
    }
  }
`);
const SimilarDocument = graphql(`query Similar($input: SimilarSourceAdsInput!) { similarSourceAds(input: $input) { similarity sourceAd { id title adText } } }`);
const ProcessMediaAssetDocument = graphql(`mutation ProcessMediaAsset($mediaAssetId: ID!) { processMediaAsset(mediaAssetId: $mediaAssetId) { id status } }`);
const AnalyzeSourceAdDocument = graphql(`mutation AnalyzeSourceAd($input: AnalyzeSourceAdInput!) { analyzeSourceAd(input: $input) { id status } }`);
const RedownloadMediaDocument = graphql(`mutation RedownloadSourceAdMedia($sourceAdId: ID!) { redownloadSourceAdMedia(sourceAdId: $sourceAdId) { id status } }`);

function dateLabel(value: unknown) {
  return value ? new Intl.DateTimeFormat('ko-KR').format(new Date(String(value))) : '날짜 없음';
}

export function SourceAdDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, refetch } = useQuery(SourceAdDocument, { variables: { id: id! }, skip: !id, pollInterval: 3000 });
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const job = useJobPolling(jobId);
  const [processMediaAsset] = useMutation(ProcessMediaAssetDocument);
  const [analyzeSourceAd] = useMutation(AnalyzeSourceAdDocument);
  const [redownloadMedia] = useMutation(RedownloadMediaDocument);
  const [loadSimilar, similarQuery] = useLazyQuery(SimilarDocument);
  const ad = data?.sourceAd;

  useEffect(() => {
    if (!mediaUrl && ad?.mediaAsset?.mediaUrl) setMediaUrl(ad.mediaAsset.mediaUrl);
  }, [ad?.mediaAsset?.mediaUrl, mediaUrl]);
  useEffect(() => {
    if (job?.status === 'SUCCEEDED' || job?.status === 'FAILED') void refetch();
  }, [job?.status, refetch]);

  async function run(action: () => Promise<string | null>) {
    setError(null);
    try { setJobId(await action()); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

  async function onSimilar() {
    setError(null);
    try { await loadSimilar({ variables: { input: { sourceAdId: id!, limit: 5 } } }); }
    catch (cause) {
      const code = (cause as { graphQLErrors?: Array<{ extensions?: { code?: string } }> }).graphQLErrors?.[0]?.extensions?.code;
      setError(code === 'EMBEDDING_NOT_READY' ? '분석이 끝나면 검색할 수 있습니다' : cause instanceof Error ? cause.message : String(cause));
    }
  }

  if (!ad) return <section><p className="muted">광고를 불러오는 중…</p></section>;
  return (
    <section className="stage-collect ad-detail">
      <Link className="back-link" to="/ads">← 광고 목록</Link>
      <header className="page-header">
        <div><div className="page-header-title-row"><h1>{ad.title ?? ad.adText ?? ad.id}</h1><StatusBadge status={ad.status} /></div><p>{ad.competitor?.name ?? '광고주 정보 없음'}</p></div>
        <div className="page-header-actions ad-actions">
          {ad.mediaAsset && <><Button data-hint="이미지 글자·영상 음성을 텍스트로 추출합니다 (AI, 건당 1~2센트)" size="sm" onClick={() => void run(async () => (await processMediaAsset({ variables: { mediaAssetId: ad.mediaAsset!.id } })).data!.processMediaAsset.id)}>미디어 텍스트 추출</Button><Button data-hint="추출된 텍스트로 훅·타깃·감정을 분류합니다 (AI, 약 1센트)" size="sm" onClick={() => void run(async () => (await analyzeSourceAd({ variables: { input: { sourceAdId: ad.id } } })).data!.analyzeSourceAd.id)}>광고 분석</Button></>}
          {ad.sourceUrl && <Button data-hint="원본 미디어를 다시 받습니다 (무료)" size="sm" onClick={() => void run(async () => (await redownloadMedia({ variables: { sourceAdId: ad.id } })).data!.redownloadSourceAdMedia.id)}>재다운로드</Button>}
          <Button data-hint="비슷한 메시지의 광고를 검색합니다 (무료)" size="sm" onClick={() => void onSimilar()}>유사 광고</Button>
        </div>
      </header>
      {error && <p className="error" role="alert">{error}</p>}
      {job && job.status !== 'SUCCEEDED' && job.status !== 'FAILED' && <p>분석 중… ({job.status})</p>}
      <Card className="card-stack">
        <h2>미디어</h2>
        {mediaUrl && ad.mediaAsset ? <div className="detail-media">{ad.mediaAsset.kind === MediaAssetKind.Video ? <video controls src={mediaUrl} /> : <img src={mediaUrl} alt={ad.title ?? '광고 원본'} />}<a href={mediaUrl} download>원본 다운로드</a></div> : <p className="muted">등록된 미디어가 없습니다.</p>}
      </Card>
      <Card className="card-stack"><h2>메타 정보</h2><dl className="brand-dl"><div><dt>광고주</dt><dd>{ad.competitor?.name ?? '없음'}</dd></div><div><dt>네트워크·국가</dt><dd>{[...ad.networks, ...ad.countries].join(' · ') || '없음'}</dd></div><div><dt>기간</dt><dd>{dateLabel(ad.firstSeenAt)} ~ {dateLabel(ad.lastSeenAt)}</dd></div><div><dt>출처</dt><dd>{ad.origin} · {ad.provider}{ad.sourceUrl && <> · <a href={ad.sourceUrl} target="_blank" rel="noreferrer">원본 링크</a></>}</dd></div><div><dt>신뢰도</dt><dd>{ad.confidence}</dd></div></dl></Card>
      <Card className="card-stack"><h2>추출 텍스트</h2>{ad.adText && <><h3>광고 문구</h3><p className="long-copy">{ad.adText}</p></>}{ad.mediaAsset?.ocrResults.map((item) => <div key={item.id}><h3>OCR</h3><p className="long-copy">{item.text}</p></div>)}{ad.mediaAsset?.transcriptions.map((item) => <div key={item.id}><h3>전사{item.language ? ` (${item.language})` : ''}</h3><p className="long-copy">{item.text}</p></div>)}{!ad.adText && !ad.mediaAsset?.ocrResults.length && !ad.mediaAsset?.transcriptions.length && <p className="muted">추출된 텍스트가 없습니다.</p>}</Card>
      <Card className="card-stack"><h2>최신 분석 결과</h2>{ad.latestAnalysis ? <dl className="brand-dl"><div><dt>요약</dt><dd>{ad.latestAnalysis.summary}</dd></div><div><dt>훅</dt><dd>{ad.latestAnalysis.hookType}</dd></div><div><dt>타깃</dt><dd>{ad.latestAnalysis.targetAudience.join(', ')}</dd></div><div><dt>감정</dt><dd>{ad.latestAnalysis.emotionalTriggers.join(', ')}</dd></div><div><dt>장르</dt><dd>{ad.latestAnalysis.genres.join(', ')}</dd></div></dl> : <p className="muted">분석 결과가 없습니다.</p>}</Card>
      <Card className="card-stack"><h2>이 광고를 참조한 브리프</h2>{ad.referencingBriefs.length ? <ul className="compact-list">{ad.referencingBriefs.map((brief) => <li key={brief.id}><Link to={`/briefs/${brief.id}`}>{brief.title}</Link></li>)}</ul> : <p className="muted">참조한 브리프가 없습니다.</p>}</Card>
      {similarQuery.loading && <p>검색 중…</p>}
      {similarQuery.data && <Card className="card-stack"><h2>유사 광고</h2><ul className="similar-list">{similarQuery.data.similarSourceAds.map((similar) => <li key={similar.sourceAd.id}><Link to={`/ads/${similar.sourceAd.id}`}>{similar.similarity.toFixed(2)} — {similar.sourceAd.title ?? similar.sourceAd.adText ?? similar.sourceAd.id}</Link></li>)}</ul></Card>}
    </section>
  );
}
