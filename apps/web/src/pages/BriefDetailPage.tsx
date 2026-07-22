import { useMutation, useQuery } from '@apollo/client';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { graphql } from '../generated';
import { CreativeType, JobStatus, LocalizationKind } from '../generated/graphql';
import { useJobPolling } from '../hooks/useJobPolling';
import './media.css';
import './briefs.css';

const CreativeBriefDocument = graphql(`
  query CreativeBriefDetail($id: ID!) {
    creativeBrief(id: $id) {
      id title audienceHypothesis desire hookType messageAngle visualFormat callToAction rationale focusText brandId createdAt zhTwJson
      brand { id name }
      references { sourceAdId title method similarity deleted }
      provider model promptVersion rawJson
      creatives { id variantIndex koreanText status localizations { id kind text } }
    }
  }
`);
const GenerateCreativeVariantsDocument = graphql(`mutation GenerateCreativeVariants($input: GenerateCreativeVariantsInput!) { generateCreativeVariants(input: $input) { job { id status } } }`);

function dateLabel(value: unknown) {
  return value ? new Intl.DateTimeFormat('ko-KR').format(new Date(String(value))) : '';
}

type BriefFields = { title: string; audienceHypothesis: string; desire: string; hookType: string; messageAngle: string; visualFormat: string; callToAction: string; rationale: string };
const LANG_STORAGE_KEY = 'babeloop-brief-lang';

export function BriefDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, refetch } = useQuery(CreativeBriefDocument, { variables: { id: id! }, skip: !id, pollInterval: 3000 });
  const [generateVariants] = useMutation(GenerateCreativeVariantsDocument);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 한국 작업자·대만 검수자가 같은 브리프를 각자 언어로 읽는다 — 선택은 브라우저에 기억
  const [lang, setLang] = useState<'ko' | 'zhTw'>(() => (localStorage.getItem(LANG_STORAGE_KEY) === 'zhTw' ? 'zhTw' : 'ko'));
  const job = useJobPolling(jobId);
  useEffect(() => { localStorage.setItem(LANG_STORAGE_KEY, lang); }, [lang]);
  useEffect(() => {
    if (job?.status === JobStatus.Failed) { setError(job.error ?? '생성 작업에 실패했습니다'); setJobId(null); return; }
    if (job?.status !== JobStatus.Succeeded) return;
    void refetch(); setJobId(null);
    const timer = window.setTimeout(() => void refetch(), 2000);
    return () => window.clearTimeout(timer);
  }, [job?.error, job?.status, refetch]);

  async function onGenerateVariants() {
    if (brief!.creatives.length > 0 && !window.confirm(`이미 변형 ${brief!.creatives.length}개가 있습니다. 다시 실행하면 새 변형 3개가 추가되며 AI 비용이 발생합니다. 계속할까요?`)) return;
    setError(null);
    try {
      const result = await generateVariants({ variables: { input: { briefId: id!, type: CreativeType.Copy, count: 3 } } });
      setJobId(result.data!.generateCreativeVariants.job.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

  const brief = data?.creativeBrief;
  if (!brief) return <section><p className="muted">브리프를 불러오는 중…</p></section>;
  const performanceContext = (JSON.parse(brief.rawJson) as { performanceContext?: { trackingCode: string; koreanText: string } }).performanceContext;
  const zhTw = brief.zhTwJson ? (JSON.parse(brief.zhTwJson) as BriefFields) : null;
  const showZh = lang === 'zhTw' && zhTw !== null;
  const fields: BriefFields = showZh ? zhTw! : brief;
  return (
    <section className="stage-create brief-detail ad-detail">
      <Link className="back-link" to="/briefs">← 브리프 목록</Link>
      <header className="page-header">
        <div>
          <div className="page-header-title-row"><h1>{fields.title}</h1><span className="step-chip">생성</span></div>
          <p>{dateLabel(brief.createdAt)} 생성 · 변형 {brief.creatives.length}개</p>
        </div>
        <div className="page-header-actions">
          <div className="lang-toggle" role="group" aria-label="브리프 표시 언어">
            <button type="button" className={lang === 'ko' ? 'active' : ''} onClick={() => setLang('ko')}>한국어</button>
            <button type="button" className={lang === 'zhTw' ? 'active' : ''} data-hint={zhTw ? undefined : '이 브리프는 한 언어로만 생성되어 번체중문 병행본이 없습니다'} onClick={() => setLang('zhTw')}>繁體中文</button>
          </div>
          <Button data-hint="브리프를 바탕으로 광고 문구 3개와 zh-TW 초안을 생성합니다 (AI 비용 발생)" variant={brief.creatives.length === 0 ? 'primary' : 'secondary'} size="sm" disabled={Boolean(jobId)} onClick={() => void onGenerateVariants()}>문구 변형 3개 생성</Button>
        </div>
      </header>
      {error && <p className="error" role="alert">{error}</p>}
      {job && job.status !== JobStatus.Succeeded && job.status !== JobStatus.Failed && <p>생성 중… ({job.status})</p>}

      <Card className="card-stack">
        <h2>브리프 전체 내용</h2>
        {lang === 'zhTw' && !zhTw && <p className="muted">이 브리프는 한 언어로만 생성되어 번체중문 병행본이 없습니다. 원문을 표시합니다.</p>}
        <div className="insight-facet"><span className="facet-label">훅</span><div className="tag-row"><span className="tag tag-accent">{fields.hookType}</span></div></div>
        <div className="brief-fields">
          <div className="brief-field"><span className="facet-label">욕구</span><p>{fields.desire}</p></div>
          <div className="brief-field"><span className="facet-label">메시지 앵글</span><p>{fields.messageAngle}</p></div>
          <div className="brief-field"><span className="facet-label">비주얼 형식</span><p>{fields.visualFormat}</p></div>
          <div className="brief-field"><span className="facet-label">CTA</span><p>{fields.callToAction}</p></div>
          <div className="brief-field"><span className="facet-label">타깃</span><p>{fields.audienceHypothesis}</p></div>
          <div className="brief-field brief-field-wide"><span className="facet-label">근거</span><p>{fields.rationale}</p></div>
        </div>
      </Card>

      <Card className="card-stack">
        <h2>이 브리프가 참고한 것</h2>
        <dl className="brand-dl">
          {brief.focusText && <div><dt>입력 포커스</dt><dd>{brief.focusText}</dd></div>}
          <div><dt>브랜드</dt><dd>{brief.brand ? <Link to={`/brands/${brief.brand.id}`}>{brief.brand.name}</Link> : '기본 컨텍스트 (BabeChat · 대만)'}</dd></div>
          <div><dt>참조 경쟁 광고</dt><dd>{brief.references.length ? <ul className="compact-list">{brief.references.map((reference, index) => <li key={`${reference.sourceAdId}-${index}`}>{reference.deleted || !reference.sourceAdId ? <span>{reference.title ?? '알 수 없는 광고'} (삭제됨)</span> : <Link to={`/ads/${reference.sourceAdId}`}>{reference.title ?? reference.sourceAdId}</Link>} {' '}<span className="status-badge">{reference.method === 'SIMILARITY' ? `자동 검색 · 유사도 ${(reference.similarity ?? 0).toFixed(2)}` : reference.method === 'MANUAL' ? '직접 지정' : '기록 없음'}</span></li>)}</ul> : '참조한 광고가 없습니다.'}</dd></div>
          {performanceContext && <div><dt>성과 환류</dt><dd>추적코드 {performanceContext.trackingCode} · 기준 문구 {performanceContext.koreanText}</dd></div>}
        </dl>
        <p className="ai-meta">AI 정보: {brief.provider} · {brief.model} · {brief.promptVersion}</p>
      </Card>

      <Card className="card-stack">
        <h2>문구 변형 {brief.creatives.length}개</h2>
        {brief.creatives.length === 0 && <p className="muted">아직 변형이 없습니다. 우상단 「문구 변형 3개 생성」을 실행하면 한국어 문구 3개와 번체중문 초안이 만들어집니다.</p>}
        <ol className="variant-list">
          {brief.creatives.map((creative) => {
            const draft = creative.localizations.find((localization) => localization.kind === LocalizationKind.AiDraft);
            return (
              <li className="variant-item" key={creative.id}>
                <div className="variant-head">
                  <span className="variant-chip">V{creative.variantIndex}</span>
                  <StatusBadge status={creative.status} />
                  <Link className="brand-detail-cta" to={`/review/${creative.id}`}>검토에서 보기 →</Link>
                </div>
                <p className="long-copy">{creative.koreanText}</p>
                <div className="localized-box"><span className="facet-label">번체중문 초안</span><p>{draft?.text ?? '현지화 중…'}</p></div>
              </li>
            );
          })}
        </ol>
      </Card>
    </section>
  );
}
