import { useMutation, useQuery } from '@apollo/client';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { graphql } from '../generated';
import { CreativeType, JobStatus, LocalizationKind } from '../generated/graphql';
import { useJobPolling } from '../hooks/useJobPolling';

const CreativeBriefDocument = graphql(`
  query CreativeBriefDetail($id: ID!) {
    creativeBrief(id: $id) {
      id title audienceHypothesis desire hookType messageAngle visualFormat callToAction rationale
      referencedAds { id title }
      creatives { id variantIndex koreanText status localizations { id kind text } }
    }
  }
`);
const GenerateCreativeVariantsDocument = graphql(`mutation GenerateCreativeVariants($input: GenerateCreativeVariantsInput!) { generateCreativeVariants(input: $input) { job { id status } } }`);

export function BriefDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, refetch } = useQuery(CreativeBriefDocument, { variables: { id: id! }, skip: !id, pollInterval: 3000 });
  const [generateVariants] = useMutation(GenerateCreativeVariantsDocument);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const job = useJobPolling(jobId);
  useEffect(() => {
    if (job?.status === JobStatus.Failed) { setError(job.error ?? '생성 작업에 실패했습니다'); setJobId(null); return; }
    if (job?.status !== JobStatus.Succeeded) return;
    void refetch(); setJobId(null);
    const timer = window.setTimeout(() => void refetch(), 2000);
    return () => window.clearTimeout(timer);
  }, [job?.error, job?.status, refetch]);

  async function onGenerateVariants() {
    setError(null);
    try {
      const result = await generateVariants({ variables: { input: { briefId: id!, type: CreativeType.Copy, count: 3 } } });
      setJobId(result.data!.generateCreativeVariants.job.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

  const brief = data?.creativeBrief;
  if (!brief) return <section><p className="muted">브리프를 불러오는 중…</p></section>;
  return (
    <section className="stage-create brief-detail">
      <Link className="back-link" to="/briefs">← 브리프 목록</Link>
      <header className="page-header"><div><div className="page-header-title-row"><h1>{brief.title}</h1><span className="step-chip">생성</span></div></div><div className="page-header-actions"><Button data-hint="브리프를 바탕으로 광고 문구 3개와 zh-TW 초안을 생성합니다 (AI 비용 발생)" variant="primary" disabled={Boolean(jobId)} onClick={() => void onGenerateVariants()}>문구 변형 3개 생성</Button></div></header>
      {error && <p role="alert">{error}</p>}{job && job.status !== JobStatus.Succeeded && job.status !== JobStatus.Failed && <p>생성 중… ({job.status})</p>}
      <Card className="card-stack"><h2>브리프 전체 내용</h2><dl className="brand-dl"><div><dt>욕구</dt><dd>{brief.desire}</dd></div><div><dt>훅</dt><dd>{brief.hookType}</dd></div><div><dt>메시지 앵글</dt><dd>{brief.messageAngle}</dd></div><div><dt>비주얼 형식</dt><dd>{brief.visualFormat}</dd></div><div><dt>CTA</dt><dd>{brief.callToAction}</dd></div><div><dt>타깃</dt><dd>{brief.audienceHypothesis}</dd></div><div><dt>근거</dt><dd>{brief.rationale}</dd></div></dl></Card>
      <Card className="card-stack"><h2>참조한 경쟁 광고</h2>{brief.referencedAds.length ? <ul className="compact-list">{brief.referencedAds.map((ad) => <li key={ad.id}><Link to={`/ads/${ad.id}`}>{ad.title ?? ad.id}</Link></li>)}</ul> : <p className="muted">참조한 광고가 없습니다.</p>}</Card>
      <Card className="card-stack"><h2>문구 변형 {brief.creatives.length}개</h2><ol className="card-list">{brief.creatives.map((creative) => { const draft = creative.localizations.find((localization) => localization.kind === LocalizationKind.AiDraft); return <li key={creative.id}><div className="card-stack"><div className="inline-actions"><StatusBadge status={creative.status} /><strong>{creative.variantIndex}. {creative.koreanText}</strong></div><div className="localized-copy"><span className="field-label">번체중문 초안</span><p>{draft?.text ?? '현지화 중…'}</p></div><Link className="brand-detail-cta" to={`/review/${creative.id}`}>검토에서 보기 →</Link></div></li>; })}</ol></Card>
    </section>
  );
}
