import { useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { graphql } from '../generated';

const ExperimentDocument = graphql(`query ExperimentDetail($id: ID!) { experiment(id: $id) { id code name marketCode variants { id variantCode trackingCode creative { id koreanText status } } } exportPackages(experimentId: $id) { id manifestJson createdAt } }`);
const ExportExperimentDocument = graphql(`mutation ExperimentsExport($input: ExportExperimentInput!) { exportExperiment(input: $input) { package { id } files { trackingCode filename url } manifestUrl } }`);
interface ExportView { files: Array<{ trackingCode: string; filename: string; url: string }>; manifestUrl: string; }

export function ExperimentDetailPage() {
  const { id } = useParams<{ id: string }>(); const { data, refetch } = useQuery(ExperimentDocument, { variables: { id: id! }, skip: !id });
  const [exportExperiment] = useMutation(ExportExperimentDocument); const [exported, setExported] = useState<ExportView | null>(null); const [error, setError] = useState<string | null>(null);
  async function onExport() { setError(null); try { const result = await exportExperiment({ variables: { input: { experimentId: id! } } }); setExported(result.data!.exportExperiment); await refetch(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }
  const experiment = data?.experiment; if (!experiment) return <section><p className="muted">실험을 불러오는 중…</p></section>;
  return <section className="stage-export experiment-detail"><Link className="back-link" to="/experiments">← 실험 목록</Link><header className="page-header"><div><div className="page-header-title-row"><h1>{experiment.name}</h1><span className="experiment-code">{experiment.code}</span></div><p>{experiment.marketCode}</p></div><div className="page-header-actions"><Button data-hint="추적코드가 붙은 집행용 파일을 생성합니다 (무료)" variant="primary" onClick={() => void onExport()}>내보내기</Button></div></header>
    {error && <p role="alert">{error}</p>}
    <Card className="card-stack"><h2>변형</h2><div className="table-wrap"><table className="data-table"><thead><tr><th>변형코드</th><th>추적코드</th><th>문구 요약</th><th>상태</th></tr></thead><tbody>{experiment.variants.map((variant) => <tr key={variant.id}><td>{variant.variantCode}</td><td>{variant.trackingCode}</td><td><Link to={`/review/${variant.creative.id}`}>{variant.creative.koreanText.slice(0, 100)}</Link></td><td><StatusBadge status={variant.creative.status} /></td></tr>)}</tbody></table></div></Card>
    {exported && <Card className="card-stack"><h2>결과 파일</h2>{exported.files.map((file) => <p key={file.trackingCode}><a href={file.url}>{file.filename}</a></p>)}<p><a href={exported.manifestUrl}>manifest.csv</a></p></Card>}
    <Card className="card-stack"><h2>내보내기 이력</h2>{data?.exportPackages.length ? <ul className="compact-list">{data.exportPackages.map((item) => <li key={item.id}><span>{new Intl.DateTimeFormat('ko-KR').format(new Date(item.createdAt))} · {item.manifestJson}</span></li>)}</ul> : <p className="muted">내보내기 이력이 없습니다.</p>}</Card>
  </section>;
}
