import { useMutation, useQuery } from '@apollo/client';
import { FormEvent, useEffect, useState } from 'react';
import { graphql } from '../generated';
import { JobStatus } from '../generated/graphql';
import { useJobPolling } from '../hooks/useJobPolling';
import { Link } from 'react-router';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FormField } from '../components/FormField';
import { PageHeader } from '../components/PageHeader';
import { HelpPanel, InfoTip } from '../components/HelpPanel';

const CreativeBriefsDocument = graphql(`
  query CreativeBriefs {
    creativeBriefs {
      id title hookType callToAction createdAt
      creatives { id }
    }
  }
`);

const BriefBrandsDocument = graphql(`query BriefBrands { brands { id name } }`);

const GenerateCreativeBriefDocument = graphql(`
  mutation GenerateCreativeBrief($input: GenerateCreativeBriefInput!) {
    generateCreativeBrief(input: $input) { job { id status } }
  }
`);

export function BriefsPage() {
  // 변형 잡 완료 후에도 현지화 잡이 뒤따라 도착하므로 목록은 상시 폴링한다 (내부 도구 — 비용 무시 가능)
  const { data, refetch } = useQuery(CreativeBriefsDocument, { pollInterval: 3000 });
  const { data: brandsData } = useQuery(BriefBrandsDocument);
  const [generateBrief] = useMutation(GenerateCreativeBriefDocument);
  const [title, setTitle] = useState('');
  const [focusText, setFocusText] = useState('');
  const [brandId, setBrandId] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
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
  }, [job?.error, job?.status, refetch]);

  async function onGenerateBrief(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const result = await generateBrief({
        variables: { input: { title: title || undefined, focusText, brandId: brandId || undefined } },
      });
      setJobId(result.data!.generateCreativeBrief.job.id);
      setTitle('');
      setFocusText('');
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
            <h2><Link to={`/briefs/${brief.id}`}>{brief.title}</Link></h2>
            <p>훅: {brief.hookType} · CTA: {brief.callToAction}</p>
            <p className="muted">변형 {brief.creatives.length}개 · {new Intl.DateTimeFormat('ko-KR').format(new Date(brief.createdAt))}</p>
            <Link className="brand-detail-cta" to={`/briefs/${brief.id}`}>상세 보기 →</Link>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
