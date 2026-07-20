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
import { HelpPanel, InfoTip } from '../components/HelpPanel';

const CreativeBriefsDocument = graphql(`
  query CreativeBriefs {
    creativeBriefs {
      id title hookType desire callToAction rationale createdAt
      referencedAds { id title }
      creatives {
        id variantIndex koreanText type status
        localizations { kind text }
      }
    }
  }
`);

const BriefBrandsDocument = graphql(`query BriefBrands { brands { id name } }`);

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
  const { data: brandsData } = useQuery(BriefBrandsDocument);
  const [generateBrief] = useMutation(GenerateCreativeBriefDocument);
  const [generateVariants] = useMutation(GenerateCreativeVariantsDocument);
  const [title, setTitle] = useState('');
  const [focusText, setFocusText] = useState('');
  const [brandId, setBrandId] = useState('');
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
        variables: { input: { title: title || undefined, focusText, brandId: brandId || undefined } },
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
    <section className="stage-create">
      <PageHeader title="브리프" step="루프 3단계 — 생성" description="분석된 경쟁 패턴과 브랜드 정보로 AI가 광고 기획서(브리프)를 씁니다. 포커스 문장으로 브리프 생성 → 카드에서 문구 변형 3개 생성 → 번체중문 초안까지 자동으로 만들어지면, 검토 탭에서 승인 절차를 진행하세요." />
      <HelpPanel page="briefs" />
      <Card className="page-form-card">
        <h2>브리프 생성 <InfoTip hint="브리프란? 누구에게, 어떤 메시지를, 어떤 형식으로 보여줄지 정리한 광고 기획서입니다." /></h2>
        <form className="page-form" onSubmit={onGenerateBrief}>
          <FormField label="제목" htmlFor="brief-title"><input id="brief-title" value={title} onChange={(event) => setTitle(event.target.value)} /></FormField>
          <FormField label="브랜드" htmlFor="brief-brand"><select id="brief-brand" value={brandId} onChange={(event) => setBrandId(event.target.value)}><option value="">선택 안 함</option>{brandsData?.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></FormField>
          <FormField label={<>포커스 <InfoTip hint="만들고 싶은 광고의 방향을 한 문장으로. 이 문장과 비슷한 경쟁 광고를 자동으로 찾아 참고합니다" /></>} htmlFor="brief-focus"><textarea id="brief-focus"
              required
              value={focusText}
              onChange={(event) => setFocusText(event.target.value)}
            /></FormField>
          <Button data-hint="브랜드와 경쟁 광고를 근거로 광고 기획서를 생성합니다 (AI 비용 발생)" variant="primary" type="submit" disabled={working}>브리프 생성</Button>
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
            <details className="reference-list"><summary>참조한 경쟁 광고 {brief.referencedAds.length}건</summary><ul>{brief.referencedAds.map((ad) => <li key={ad.id}>{ad.title ?? ad.id}</li>)}</ul></details>
            <Button data-hint="브리프를 바탕으로 광고 문구 3개와 zh-TW 초안을 생성합니다 (AI 비용 발생)" disabled={working} onClick={() => void onGenerateVariants(brief.id)}>
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
