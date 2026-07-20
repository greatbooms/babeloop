import { useMutation, useQuery } from '@apollo/client';
import { FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FormField } from '../components/FormField';
import { HelpPanel } from '../components/HelpPanel';
import { PageHeader } from '../components/PageHeader';
import { graphql } from '../generated';

const ExperimentsPageDocument = graphql(`query ExperimentsPage { experiments { id code name marketCode hasExports variants { id } } }`);
const CreateExperimentDocument = graphql(`mutation ExperimentsCreate($input: CreateExperimentInput!) { createExperiment(input: $input) { id code name } }`);

export function ExperimentsPage() {
  const { data, refetch } = useQuery(ExperimentsPageDocument);
  const [createExperiment] = useMutation(CreateExperimentDocument);
  const [showCreate, setShowCreate] = useState(false); const [code, setCode] = useState(''); const [name, setName] = useState(''); const [error, setError] = useState<string | null>(null);
  async function onCreate(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(null); try { await createExperiment({ variables: { input: { code, name } } }); setCode(''); setName(''); setShowCreate(false); await refetch(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }
  return <section className="stage-export">
    <PageHeader title="실험" step="루프 5단계 — 내보내기" description="승인된 문구를 실험 단위로 묶어 광고로 내보내는 곳입니다. 실험 생성 → 검토 탭에서 승인 문구를 실험에 추가 → 내보내기를 누르면 추적코드(BL-…)가 각인된 집행용 파일을 받습니다. 이 코드가 나중에 성과를 소재별로 연결합니다." actions={<Button variant="primary" onClick={() => setShowCreate((value) => !value)}>새 실험 생성</Button>} />
    <HelpPanel page="experiments" />
    {showCreate && <Card className="page-form-card"><form className="page-form" onSubmit={onCreate}><FormField label="실험 코드" htmlFor="experiment-code"><input id="experiment-code" required value={code} onChange={(event) => setCode(event.target.value)} /></FormField><FormField label="실험 이름" htmlFor="experiment-name"><input id="experiment-name" required value={name} onChange={(event) => setName(event.target.value)} /></FormField><div className="inline-actions"><Button variant="primary" type="submit">실험 생성</Button><Button type="button" onClick={() => setShowCreate(false)}>취소</Button></div></form></Card>}
    {error && <p role="alert">{error}</p>}
    <ul className="card-list card-grid">{data?.experiments.map((experiment) => <li key={experiment.id}><Link className="brand-list-card" to={`/experiments/${experiment.id}`}><Card className="card-stack"><span className="experiment-code">{experiment.code}</span><h2>{experiment.name}</h2><p className="muted">{experiment.marketCode} · 변형 {experiment.variants.length}개</p><p className="muted">{experiment.hasExports ? '최근 내보내기 있음' : '내보내기 없음'}</p><span className="brand-detail-cta">상세 보기 →</span></Card></Link></li>)}</ul>
  </section>;
}
