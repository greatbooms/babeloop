import { useMutation, useQuery } from '@apollo/client';
import { FormEvent, useEffect, useState } from 'react';
import { graphql } from '../generated';
import { CreativeType, JobStatus, LocalizationKind } from '../generated/graphql';
import { useJobPolling } from '../hooks/useJobPolling';

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
    <main>
      <h1>브리프</h1>

      <section>
        <h2>브리프 생성</h2>
        <form onSubmit={onGenerateBrief}>
          <label>
            제목
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            포커스
            <textarea
              required
              value={focusText}
              onChange={(event) => setFocusText(event.target.value)}
            />
          </label>
          <button type="submit" disabled={working}>브리프 생성</button>
        </form>
      </section>

      {error && <p role="alert">{error}</p>}
      {job && job.status !== JobStatus.Succeeded && job.status !== JobStatus.Failed && (
        <p>생성 중… ({job.status})</p>
      )}

      <ul>
        {data?.creativeBriefs.map((brief) => (
          <li key={brief.id}>
            <h2>{brief.title}</h2>
            <p>욕구: {brief.desire}</p>
            <p>훅: {brief.hookType}</p>
            <p>CTA: {brief.callToAction}</p>
            <p>근거: {brief.rationale}</p>
            <button disabled={working} onClick={() => void onGenerateVariants(brief.id)}>
              문구 변형 3개 생성
            </button>
            <ol>
              {brief.creatives.map((creative) => {
                const draft = creative.localizations.find(
                  (localization) => localization.kind === LocalizationKind.AiDraft,
                );
                return (
                  <li key={creative.id}>
                    <p>{creative.variantIndex}. {creative.koreanText}</p>
                    <p>{draft?.text ?? '현지화 중…'}</p>
                  </li>
                );
              })}
            </ol>
          </li>
        ))}
      </ul>
    </main>
  );
}
