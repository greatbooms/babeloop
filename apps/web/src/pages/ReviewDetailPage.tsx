import { useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { graphql } from '../generated';
import { CreativeStatus, UserRole } from '../generated/graphql';

const ReviewCreativeDocument = graphql(`query ReviewCreative($id: ID!) { creative(id: $id) { id briefTitle locale type status variantIndex revision koreanText minorFlagged minorFlagNote localizations { id kind locale text createdAt } policyChecks { id checkType status detailJson createdAt } reviewEvents { id kind actorId note createdAt } experimentVariants { id variantCode trackingCode } } }`);
const ReviewExperimentsDocument = graphql(`query ReviewExperiments { experiments { id code name } }`);
const ReviewMeDocument = graphql(`query ReviewMe { me { id role } }`);
const RunPolicyCheckDocument = graphql(`mutation ReviewRunPolicyCheck($input: CreativeIdInput!) { runPolicyCheck(input: $input) { id status } }`);
const RequestReviewDocument = graphql(`mutation ReviewRequestCreative($input: CreativeIdInput!) { requestCreativeReview(input: $input) { id status } }`);
const ReviseLocalizationDocument = graphql(`mutation ReviewReviseLocalization($input: ReviseLocalizationInput!) { reviseLocalization(input: $input) { id status } }`);
const ApproveLocalizationDocument = graphql(`mutation ReviewApproveLocalization($input: CreativeNoteInput!) { approveLocalization(input: $input) { id status } }`);
const ApproveCreativeDocument = graphql(`mutation ReviewApproveCreative($input: CreativeNoteInput!) { approveCreative(input: $input) { id status } }`);
const RequestRevisionDocument = graphql(`mutation ReviewRequestRevision($input: CreativeReasonInput!) { requestCreativeRevision(input: $input) { id status } }`);
const RejectCreativeDocument = graphql(`mutation ReviewRejectCreative($input: CreativeReasonInput!) { rejectCreative(input: $input) { id status } }`);
const ReleaseMinorFlagDocument = graphql(`mutation ReviewReleaseMinorFlag($input: CreativeReasonInput!) { releaseMinorFlag(input: $input) { id minorFlagged } }`);
const AddCreativeToExperimentDocument = graphql(`mutation ReviewAddCreativeToExperiment($input: AddCreativeToExperimentInput!) { addCreativeToExperiment(input: $input) { id trackingCode } }`);

export function ReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, refetch } = useQuery(ReviewCreativeDocument, { variables: { id: id! }, skip: !id, pollInterval: 3000 });
  const { data: experimentsData, refetch: refetchExperiments } = useQuery(ReviewExperimentsDocument);
  const { data: meData } = useQuery(ReviewMeDocument);
  const [runPolicyCheck] = useMutation(RunPolicyCheckDocument); const [requestReview] = useMutation(RequestReviewDocument);
  const [reviseLocalization] = useMutation(ReviseLocalizationDocument); const [approveLocalization] = useMutation(ApproveLocalizationDocument);
  const [approveCreative] = useMutation(ApproveCreativeDocument); const [requestRevision] = useMutation(RequestRevisionDocument);
  const [rejectCreative] = useMutation(RejectCreativeDocument); const [releaseMinorFlag] = useMutation(ReleaseMinorFlagDocument);
  const [addToExperiment] = useMutation(AddCreativeToExperimentDocument);
  const [localizationEdit, setLocalizationEdit] = useState<string | null>(null); const [revisionReason, setRevisionReason] = useState('');
  const [rejectionReason, setRejectionReason] = useState(''); const [minorReason, setMinorReason] = useState('');
  const [experimentSelection, setExperimentSelection] = useState(''); const [error, setError] = useState<string | null>(null);
  const creative = data?.creative; const latestLocalization = creative?.localizations[0];
  const role = meData?.me.role; const canApprove = role === UserRole.Admin || role === UserRole.Reviewer;
  const selectedExperiment = experimentSelection || experimentsData?.experiments[0]?.id || '';
  async function act(operation: () => Promise<unknown>, alsoExperiments = false) { setError(null); try { await operation(); await refetch(); if (alsoExperiments) await refetchExperiments(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }
  if (!creative) return <section><p className="muted">검토 문구를 불러오는 중…</p></section>;
  return <section className="review-page stage-review">
    <Link className="back-link" to="/review">← 검토 목록</Link>
    <header className="page-header"><div><div className="page-header-title-row"><h1>{creative.briefTitle}</h1><StatusBadge status={creative.status} /></div><p>변형 {creative.variantIndex} · revision {creative.revision}</p></div><div className="page-header-actions">
      {creative.status === CreativeStatus.Draft && <Button data-hint="금지어·유사도·미성년 신호를 검사합니다 (AI 비용 발생)" onClick={() => void act(() => runPolicyCheck({ variables: { input: { creativeId: creative.id } } }))}>정책 검사</Button>}
      {creative.status === CreativeStatus.PolicyChecked && <Button data-hint="검수자에게 현지화와 승인 검토를 요청합니다 (무료)" onClick={() => void act(() => requestReview({ variables: { input: { creativeId: creative.id } } }))}>검토 요청</Button>}
      {creative.status === CreativeStatus.LocalizationApproved && canApprove && <Button data-hint="검수 완료 문구의 집행을 최종 승인합니다 (무료)" onClick={() => void act(() => approveCreative({ variables: { input: { creativeId: creative.id } } }))}>최종 승인</Button>}
    </div></header>
    {error && <p role="alert">{error}</p>}
    <Card className="card-stack"><h2>원문</h2><p className="long-copy">{creative.koreanText}</p><h2>zh-TW 최신본</h2><p className="long-copy">{latestLocalization?.text ?? '없음'}</p></Card>
    {creative.minorFlagged && <Card className="card-stack minor-warning"><h2>미성년자 신호</h2><p>{creative.minorFlagNote}</p>{canApprove && <><label>미성년자 해제 사유<input value={minorReason} onChange={(event) => setMinorReason(event.target.value)} /></label><Button onClick={() => void act(() => releaseMinorFlag({ variables: { input: { creativeId: creative.id, reason: minorReason } } }))}>미성년자 플래그 해제</Button></>}</Card>}
    {creative.status === CreativeStatus.InReview && <Card className="card-stack"><h2>검토 액션</h2><label>zh-TW 수정<textarea value={localizationEdit ?? latestLocalization?.text ?? ''} onChange={(event) => setLocalizationEdit(event.target.value)} /></label><Button data-hint="수정한 번체중문 문구를 저장합니다 (무료)" onClick={() => void act(() => reviseLocalization({ variables: { input: { creativeId: creative.id, text: localizationEdit ?? latestLocalization?.text ?? '' } } }))}>수정 저장</Button>{canApprove && <Button data-hint="번체중문 검수를 승인합니다 (무료)" onClick={() => void act(() => approveLocalization({ variables: { input: { creativeId: creative.id } } }))}>현지화 승인</Button>}<label>수정 요청 사유<input value={revisionReason} onChange={(event) => setRevisionReason(event.target.value)} /></label><Button data-hint="수정 사유와 함께 작성자에게 돌려보냅니다 (무료)" onClick={() => void act(() => requestRevision({ variables: { input: { creativeId: creative.id, reason: revisionReason } } }))}>수정 요청</Button><label>거절 사유<input value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} /></label><Button data-hint="광고 문구를 거절하고 사유를 기록합니다 (무료)" onClick={() => void act(() => rejectCreative({ variables: { input: { creativeId: creative.id, reason: rejectionReason } } }))}>거절</Button></Card>}
    {creative.status === CreativeStatus.Approved && <Card className="card-stack"><h2>실험에 추가</h2><label>실험 선택<select value={selectedExperiment} onChange={(event) => setExperimentSelection(event.target.value)}>{experimentsData?.experiments.map((experiment) => <option key={experiment.id} value={experiment.id}>{experiment.name}</option>)}</select></label><Button data-hint="승인 문구에 실험 추적코드를 발급합니다 (무료)" disabled={!selectedExperiment} onClick={() => void act(() => addToExperiment({ variables: { input: { creativeId: creative.id, experimentId: selectedExperiment } } }), true)}>실험에 추가</Button>{creative.experimentVariants.map((variant) => <p key={variant.id}>{variant.trackingCode}</p>)}</Card>}
    <Card className="card-stack"><h2>정책 검사 결과</h2>{creative.policyChecks.length ? <ul className="compact-list">{creative.policyChecks.map((check) => <li key={check.id}><strong>{check.checkType} · {check.status}</strong><span className="long-copy">{check.detailJson}</span></li>)}</ul> : <p className="muted">정책 검사 결과가 없습니다.</p>}</Card>
    <Card className="card-stack"><h2>검토 이벤트 이력</h2>{creative.reviewEvents.length ? <ul className="compact-list">{creative.reviewEvents.map((event) => <li key={event.id}><span><strong>{event.kind}</strong> · {new Intl.DateTimeFormat('ko-KR').format(new Date(event.createdAt))}{event.note ? ` · ${event.note}` : ''}</span></li>)}</ul> : <p className="muted">검토 이벤트가 없습니다.</p>}</Card>
  </section>;
}
