import { useMutation, useQuery } from '@apollo/client';
import { FormEvent, useEffect, useState } from 'react';
import { graphql } from '../generated';
import { CreativeType, JobStatus, LocalizationKind } from '../generated/graphql';
import { useJobPolling } from '../hooks/useJobPolling';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FormField } from '../components/FormField';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';

const CreativeBriefsDocument = graphql(`
  query CreativeBriefs {
    creativeBriefs {
      id title hookType desire callToAction rationale createdAt
      creatives {
        id variantIndex koreanText type status
        localizations { kind text }
      }
    }
  }
`);

const GenerateCreativeBriefDocument = graphql(`
  mutation GenerateCreativeBrief($input: GenerateCreativeBriefInput!) {
    generateCreativeBrief(input: $input) { job { id status } }
  }
`);

const GenerateCreativeVariantsDocument = graphql(`
  mutation GenerateCreativeVariants($input: GenerateCreativeVariantsInput!) {
    generateCreativeVariants(input: $input) { job { id status } }
  }
`);

type JobPurpose = 'brief' | 'variants';

export function BriefsPage() {
  // 변형 잡 완료 후에도 현지화 잡이 뒤따라 도착하므로 목록은 상시 폴링한다 (내부 도구 — 비용 무시 가능)
  const { data, refetch } = useQuery(CreativeBriefsDocument, { pollInterval: 3000 });
  const [generateBrief] = useMutation(GenerateCreativeBriefDocument);
  const [generateVariants] = useMutation(GenerateCreativeVariantsDocument);
  const [title, setTitle] = useState('');
  const [focusText, setFocusText] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobPurpose, setJobPurpose] = useState<JobPurpose | null>(null);
  const [error, setError] = useState<string | null>(null);
  const job = useJobPolling(jobId);

  useEffect(() => {
    if (job?.status === JobStatus.Failed) {
      setError(job.error ?? '생성 작업에 실패했습니다');
      setJobId(null);
      return;
    }
    if (job?.status !== JobStatus.Succeeded) return;
    void refetch();
    setJobId(null);
    if (jobPurpose !== 'variants') return;
    const timer = window.setTimeout(() => void refetch(), 2000);
    return () => window.clearTimeout(timer);
  }, [job?.error, job?.status, jobPurpose, refetch]);

  async function onGenerateBrief(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const result = await generateBrief({
        variables: { input: { title: title || undefined, focusText } },
      });
      setJobPurpose('brief');
      setJobId(result.data!.generateCreativeBrief.job.id);
      setTitle('');
      setFocusText('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function onGenerateVariants(briefId: string) {
    setError(null);
    try {
      const result = await generateVariants({
        variables: { input: { briefId, type: CreativeType.Copy, count: 3 } },
      });
      setJobPurpose('variants');
      setJobId(result.data!.generateCreativeVariants.job.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  const working = Boolean(jobId);

  return (
    <section>
      <PageHeader title="브리프" step="루프 3단계 — 생성" description="분석된 경쟁 패턴과 브랜드 정보로 AI가 광고 기획서(브리프)를 씁니다. 포커스 문장으로 브리프 생성 → 카드에서 문구 변형 3개 생성 → 번체중문 초안까지 자동으로 만들어지면, 검토 탭에서 승인 절차를 진행하세요." />
      <Card className="page-form-card">
        <h2>브리프 생성</h2>
        <form className="page-form" onSubmit={onGenerateBrief}>
          <FormField label="제목" htmlFor="brief-title"><input id="brief-title" value={title} onChange={(event) => setTitle(event.target.value)} /></FormField>
          <FormField label="포커스" htmlFor="brief-focus"><textarea id="brief-focus"
              required
              value={focusText}
              onChange={(event) => setFocusText(event.target.value)}
            /></FormField>
          <Button variant="primary" type="submit" disabled={working}>브리프 생성</Button>
        </form>
      </Card>

      {error && <p role="alert">{error}</p>}
      {job && job.status !== JobStatus.Succeeded && job.status !== JobStatus.Failed && (
        <p>생성 중… ({job.status})</p>
      )}

      <ul className="card-list">
        {data?.creativeBriefs.map((brief) => (
          <li key={brief.id}>
            <Card className="card-stack">
            <h2>{brief.title}</h2>
            <div className="field-grid"><p><span className="field-label">욕구</span><br/><span className="field-value">{brief.desire}</span></p><p><span className="field-label">훅</span><br/><span className="field-value">{brief.hookType}</span></p><p><span className="field-label">CTA</span><br/><span className="field-value">{brief.callToAction}</span></p></div>
            <p className="muted">근거: {brief.rationale}</p>
            <Button disabled={working} onClick={() => void onGenerateVariants(brief.id)}>
              문구 변형 3개 생성
            </Button>
            <ol className="card-list">
              {brief.creatives.map((creative) => {
                const draft = creative.localizations.find(
                  (localization) => localization.kind === LocalizationKind.AiDraft,
                );
                return (
                  <li key={creative.id}>
                    <div className="inline-actions"><StatusBadge status={creative.status} /><strong>{creative.variantIndex}. {creative.koreanText}</strong></div>
                    <div className="localized-copy"><span className="field-label">번체중문 초안</span><p>{draft?.text ?? '현지화 중…'}</p></div>
                  </li>
                );
              })}
            </ol>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
