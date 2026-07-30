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
import './media.css';
import './briefs.css';
import './review.css';

const ReviewCreativeDocument = graphql(`query ReviewCreative($id: ID!) { creative(id: $id) { id briefTitle locale type status variantIndex revision koreanText minorFlagged minorFlagNote briefImages { id url quality instructions createdAt costEstimateUsd } localizations { id kind locale text koBackTranslation createdAt } policyChecks { id checkType status detailJson createdAt } reviewEvents { id kind actorId note createdAt } experimentVariants { id variantCode trackingCode } } }`);
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
  const { data, refetch } = useQuery(ReviewCreativeDocument, { variables: { id: id! }, skip: !id, pollInterval: 3000, fetchPolicy: 'cache-and-network', nextFetchPolicy: 'cache-first' });
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
  return <section className="review-page stage-review ad-detail">
    <Link className="back-link" to="/review">{t('review.back')}</Link>
    <header className="page-header">
      <div>
        <div className="page-header-title-row"><h1>{creative.briefTitle}</h1><StatusBadge status={creative.status} /></div>
        <p>{t('review.variantRevision', { variant: creative.variantIndex, revision: creative.revision })}</p>
      </div>
      <div className="page-header-actions">
        {creative.status === CreativeStatus.Draft && <Button variant="primary" size="sm" data-hint={t('review.policyHint')} onClick={() => void act(() => runPolicyCheck({ variables: { input: { creativeId: creative.id } } }))}>{t('review.policy')}</Button>}
        {creative.status === CreativeStatus.PolicyChecked && <Button variant="primary" size="sm" data-hint={t('review.requestHint')} onClick={() => void act(() => requestReview({ variables: { input: { creativeId: creative.id } } }))}>{t('review.request')}</Button>}
        {creative.status === CreativeStatus.LocalizationApproved && canApprove && <Button variant="primary" size="sm" data-hint={t('review.finalApproveHint')} onClick={() => void act(() => approveCreative({ variables: { input: { creativeId: creative.id } } }))}>{t('review.finalApprove')}</Button>}
      </div>
    </header>
    {error && <p className="error" role="alert">{error}</p>}

    <Card className="card-stack">
      <h2>{t('review.copyTitle')}</h2>
      <div className="review-copy-grid">
        <div>
          <span className="facet-label">{t('review.original')}</span>
          <p className="long-copy">{creative.koreanText}</p>
        </div>
        <div>
          <span className="facet-label">{t('review.latestZh')}</span>
          <p className="long-copy">{latestLocalization?.text ?? t('review.none')}</p>
          {latestLocalization?.koBackTranslation && (
            <div className="localized-box"><span className="facet-label">{t('review.backTranslation')}</span><p className="long-copy">{latestLocalization.koBackTranslation}</p></div>
          )}
        </div>
      </div>
    </Card>

    {creative.briefImages.length > 0 && (
      <Card className="card-stack">
        <h2>{t('review.briefImages')}</h2>
        <p className="muted">{t('review.briefImagesGuide')}</p>
        <div className="brief-image-grid">
          {creative.briefImages.map((image) => (
            <figure className="brief-image-item" key={image.id}>
              <a href={image.url} target="_blank" rel="noreferrer" aria-label={t('review.briefImageOpen')}>
                <img src={image.url} alt={t('review.briefImageAlt')} />
              </a>
              <figcaption>
                <div className="tag-row">
                  <span className="tag tag-accent">{image.quality === 'high' ? t('briefs.qualityHigh') : t('briefs.qualityLow')}</span>
                  <span className="tag">{image.costEstimateUsd == null ? t('briefs.costUnknown') : t('briefs.imageCost', { cost: image.costEstimateUsd.toFixed(2) })}</span>
                </div>
                <p>{image.instructions || t('briefs.noImageInstructions')}</p>
                <time>{formatDate(String(image.createdAt), lang)}</time>
              </figcaption>
            </figure>
          ))}
        </div>
      </Card>
    )}

    {creative.minorFlagged && (
      <Card className="card-stack minor-warning">
        <h2>{t('review.minorSignal')}</h2>
        <p>{creative.minorFlagNote}</p>
        {canApprove && (
          <div className="review-reason-row">
            <label>{t('review.minorReason')}<input value={minorReason} onChange={(event) => setMinorReason(event.target.value)} /></label>
            <Button size="sm" onClick={() => void act(() => releaseMinorFlag({ variables: { input: { creativeId: creative.id, reason: minorReason } } }))}>{t('review.releaseMinor')}</Button>
          </div>
        )}
      </Card>
    )}

    {creative.status === CreativeStatus.InReview && (
      <Card className="card-stack">
        <h2>{t('review.actions')}</h2>
        <div className="review-edit-area">
          <label className="facet-label">{t('review.editZh')}<textarea value={localizationEdit ?? latestLocalization?.text ?? ''} onChange={(event) => setLocalizationEdit(event.target.value)} /></label>
          <div className="review-edit-actions">
            <Button size="sm" data-hint={t('review.saveEditHint')} onClick={() => void act(() => reviseLocalization({ variables: { input: { creativeId: creative.id, text: localizationEdit ?? latestLocalization?.text ?? '' } } }))}>{t('review.saveEdit')}</Button>
            {canApprove && <Button variant="primary" size="sm" data-hint={t('review.approveLocalizationHint')} onClick={() => void act(() => approveLocalization({ variables: { input: { creativeId: creative.id } } }))}>{t('review.approveLocalization')}</Button>}
          </div>
        </div>
        <hr className="review-divider" />
        <div className="review-reason-row">
          <label>{t('review.revisionReason')}<input value={revisionReason} onChange={(event) => setRevisionReason(event.target.value)} /></label>
          <Button size="sm" data-hint={t('review.requestRevisionHint')} onClick={() => void act(() => requestRevision({ variables: { input: { creativeId: creative.id, reason: revisionReason } } }))}>{t('review.requestRevision')}</Button>
        </div>
        <div className="review-reason-row">
          <label>{t('review.rejectionReason')}<input value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} /></label>
          <Button size="sm" data-hint={t('review.rejectHint')} onClick={() => void act(() => rejectCreative({ variables: { input: { creativeId: creative.id, reason: rejectionReason } } }))}>{t('review.reject')}</Button>
        </div>
      </Card>
    )}

    {creative.status === CreativeStatus.Approved && (
      <Card className="card-stack">
        <h2>{t('review.addExperiment')}</h2>
        <div className="experiment-add-row">
          <label>{t('review.experimentSelection')}<select value={selectedExperiment} onChange={(event) => setExperimentSelection(event.target.value)}>{experimentsData?.experiments.map((experiment) => <option key={experiment.id} value={experiment.id}>{experiment.name}</option>)}</select></label>
          <Button variant="primary" size="sm" data-hint={t('review.addExperimentHint')} disabled={!selectedExperiment} onClick={() => void act(() => addToExperiment({ variables: { input: { creativeId: creative.id, experimentId: selectedExperiment } } }), true)}>{t('review.addExperiment')}</Button>
        </div>
        {creative.experimentVariants.length > 0 && (
          <div className="tag-row">{creative.experimentVariants.map((variant) => <span className="tag tag-accent" key={variant.id}>{variant.trackingCode}</span>)}</div>
        )}
      </Card>
    )}

    <Card className="card-stack">
      <h2>{t('review.policyResults')}</h2>
      {creative.policyChecks.length ? creative.policyChecks.map((check) => (
        <div className="policy-row" key={check.id}>
          <strong>{check.checkType}</strong>
          <span className={`status-badge ${check.status === 'PASS' ? 'status-positive' : 'status-warn'}`}>{check.status}</span>
          <span className="policy-detail">{check.detailJson}</span>
        </div>
      )) : <p className="muted">{t('review.noPolicyResults')}</p>}
    </Card>

    <Card className="card-stack">
      <h2>{t('review.eventHistory')}</h2>
      {creative.reviewEvents.length ? creative.reviewEvents.map((event) => (
        <div className="event-row" key={event.id}>
          <span className="event-kind">{event.kind}</span>
          <span className="event-date">{formatDate(String(event.createdAt), lang)}</span>
          {event.note && <span className="event-note">{event.note}</span>}
        </div>
      )) : <p className="muted">{t('review.noEvents')}</p>}
    </Card>
  </section>;
}
