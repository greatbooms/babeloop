import { useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { graphql } from '../generated';
import { CreativeStatus, UserRole } from '../generated/graphql';
import { formatDate } from '../i18n/format-date';
import { useT } from '../i18n/lang-context';

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
  const { lang, t } = useT();
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
  if (!creative) return <section><p className="muted">{t('review.loading')}</p></section>;
  return <section className="review-page stage-review">
    <Link className="back-link" to="/review">{t('review.back')}</Link>
    <header className="page-header"><div><div className="page-header-title-row"><h1>{creative.briefTitle}</h1><StatusBadge status={creative.status} /></div><p>{t('review.variantRevision', { variant: creative.variantIndex, revision: creative.revision })}</p></div><div className="page-header-actions">
      {creative.status === CreativeStatus.Draft && <Button data-hint={t('review.policyHint')} onClick={() => void act(() => runPolicyCheck({ variables: { input: { creativeId: creative.id } } }))}>{t('review.policy')}</Button>}
      {creative.status === CreativeStatus.PolicyChecked && <Button data-hint={t('review.requestHint')} onClick={() => void act(() => requestReview({ variables: { input: { creativeId: creative.id } } }))}>{t('review.request')}</Button>}
      {creative.status === CreativeStatus.LocalizationApproved && canApprove && <Button data-hint={t('review.finalApproveHint')} onClick={() => void act(() => approveCreative({ variables: { input: { creativeId: creative.id } } }))}>{t('review.finalApprove')}</Button>}
    </div></header>
    {error && <p role="alert">{error}</p>}
    <Card className="card-stack"><h2>{t('review.original')}</h2><p className="long-copy">{creative.koreanText}</p><h2>{t('review.latestZh')}</h2><p className="long-copy">{latestLocalization?.text ?? t('review.none')}</p></Card>
    {creative.minorFlagged && <Card className="card-stack minor-warning"><h2>{t('review.minorSignal')}</h2><p>{creative.minorFlagNote}</p>{canApprove && <><label>{t('review.minorReason')}<input value={minorReason} onChange={(event) => setMinorReason(event.target.value)} /></label><Button onClick={() => void act(() => releaseMinorFlag({ variables: { input: { creativeId: creative.id, reason: minorReason } } }))}>{t('review.releaseMinor')}</Button></>}</Card>}
    {creative.status === CreativeStatus.InReview && <Card className="card-stack"><h2>{t('review.actions')}</h2><label>{t('review.editZh')}<textarea value={localizationEdit ?? latestLocalization?.text ?? ''} onChange={(event) => setLocalizationEdit(event.target.value)} /></label><Button data-hint={t('review.saveEditHint')} onClick={() => void act(() => reviseLocalization({ variables: { input: { creativeId: creative.id, text: localizationEdit ?? latestLocalization?.text ?? '' } } }))}>{t('review.saveEdit')}</Button>{canApprove && <Button data-hint={t('review.approveLocalizationHint')} onClick={() => void act(() => approveLocalization({ variables: { input: { creativeId: creative.id } } }))}>{t('review.approveLocalization')}</Button>}<label>{t('review.revisionReason')}<input value={revisionReason} onChange={(event) => setRevisionReason(event.target.value)} /></label><Button data-hint={t('review.requestRevisionHint')} onClick={() => void act(() => requestRevision({ variables: { input: { creativeId: creative.id, reason: revisionReason } } }))}>{t('review.requestRevision')}</Button><label>{t('review.rejectionReason')}<input value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} /></label><Button data-hint={t('review.rejectHint')} onClick={() => void act(() => rejectCreative({ variables: { input: { creativeId: creative.id, reason: rejectionReason } } }))}>{t('review.reject')}</Button></Card>}
    {creative.status === CreativeStatus.Approved && <Card className="card-stack"><h2>{t('review.addExperiment')}</h2><label>{t('review.experimentSelection')}<select value={selectedExperiment} onChange={(event) => setExperimentSelection(event.target.value)}>{experimentsData?.experiments.map((experiment) => <option key={experiment.id} value={experiment.id}>{experiment.name}</option>)}</select></label><Button data-hint={t('review.addExperimentHint')} disabled={!selectedExperiment} onClick={() => void act(() => addToExperiment({ variables: { input: { creativeId: creative.id, experimentId: selectedExperiment } } }), true)}>{t('review.addExperiment')}</Button>{creative.experimentVariants.map((variant) => <p key={variant.id}>{variant.trackingCode}</p>)}</Card>}
    <Card className="card-stack"><h2>{t('review.policyResults')}</h2>{creative.policyChecks.length ? <ul className="compact-list">{creative.policyChecks.map((check) => <li key={check.id}><strong>{check.checkType} · {check.status}</strong><span className="long-copy">{check.detailJson}</span></li>)}</ul> : <p className="muted">{t('review.noPolicyResults')}</p>}</Card>
    <Card className="card-stack"><h2>{t('review.eventHistory')}</h2>{creative.reviewEvents.length ? <ul className="compact-list">{creative.reviewEvents.map((event) => <li key={event.id}><span><strong>{event.kind}</strong> · {formatDate(String(event.createdAt), lang)}{event.note ? ` · ${event.note}` : ''}</span></li>)}</ul> : <p className="muted">{t('review.noEvents')}</p>}</Card>
  </section>;
}
