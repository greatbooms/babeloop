import { useMutation, useQuery } from '@apollo/client';
import { FormEvent, useEffect, useState } from 'react';
import { graphql } from '../generated';
import { JobStatus } from '../generated/graphql';
import { useJobPolling } from '../hooks/useJobPolling';
import { Link, useNavigate } from 'react-router';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FormField } from '../components/FormField';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { HelpPanel, InfoTip } from '../components/HelpPanel';
import './media.css';
import './briefs.css';

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
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [focusText, setFocusText] = useState('');
  const [brandId, setBrandId] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const job = useJobPolling(jobId);
  const navigate = useNavigate();

  // 생성이 끝나면 새 브리프 상세로 자동 이동한다 (광고 상세의 브리프 생성과 동일한 흐름)
  useEffect(() => {
    if (job?.status === JobStatus.Failed) {
      setError(job.error ?? '생성 작업에 실패했습니다');
      setJobId(null);
      return;
    }
    if (job?.status !== JobStatus.Succeeded) return;
    const briefId = job.resultJson ? (JSON.parse(job.resultJson) as { briefId?: string }).briefId : undefined;
    void refetch();
    setJobId(null);
    if (briefId) navigate(`/briefs/${briefId}`);
  }, [job?.error, job?.status, job?.resultJson, navigate, refetch]);

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
      setCreateOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  const working = Boolean(jobId);
  const briefs = data?.creativeBriefs ?? [];

  return (
    <section className="stage-create">
      <PageHeader
        title="브리프"
        step="루프 3단계 — 생성"
        description="분석된 경쟁 패턴과 브랜드 정보로 AI가 광고 기획서(브리프)를 씁니다. 포커스 문장으로 브리프 생성 → 상세에서 문구 변형 3개 생성 → 번체중문 초안까지 만들어지면 검토 탭으로 넘어가세요."
        actions={<Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>새 브리프 생성</Button>}
      />
      <HelpPanel page="briefs" />
      <Modal title="새 브리프 생성" open={createOpen} onClose={() => setCreateOpen(false)}>
        <p className="muted">브리프란? 누구에게, 어떤 메시지를, 어떤 형식으로 보여줄지 정리한 광고 기획서입니다. 포커스 문장과 비슷한 분석 완료 광고 3건이 자동으로 참조됩니다. (AI, 약 1~2센트)</p>
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
      </Modal>

      {error && <p className="error" role="alert">{error}</p>}
      {job && job.status !== JobStatus.Succeeded && job.status !== JobStatus.Failed && (
        <p>생성 중… 완료되면 새 브리프 상세로 이동합니다 ({job.status})</p>
      )}

      {briefs.length === 0 ? (
        <Card className="empty-state">
          <p>아직 브리프가 없습니다. 「새 브리프 생성」으로 시작하거나, 광고 상세의 「브리프 생성」으로 특정 광고를 참조해 만들 수 있습니다.</p>
        </Card>
      ) : (
        <ul className="briefs-grid">
          {briefs.map((brief) => (
            <li key={brief.id}>
              <Card className="brief-card">
                <h2><Link to={`/briefs/${brief.id}`}>{brief.title}</Link></h2>
                <div className="tag-row"><span className="tag tag-accent">{brief.hookType}</span></div>
                <p className="brief-cta-line">CTA: {brief.callToAction}</p>
                <p className="brief-meta">변형 {brief.creatives.length}개 · {new Intl.DateTimeFormat('ko-KR').format(new Date(brief.createdAt))}</p>
                <Link className="brand-detail-cta" to={`/briefs/${brief.id}`}>상세 보기 →</Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
