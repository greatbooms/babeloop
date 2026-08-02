import { useMutation, useQuery } from '@apollo/client';
import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FormField } from '../components/FormField';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import { graphql } from '../generated';
import { CreativeStatus, CreativeType, JobStatus, UserRole } from '../generated/graphql';
import { useJobPolling } from '../hooks/useJobPolling';
import { formatDate } from '../i18n/format-date';
import { useT } from '../i18n/lang-context';
import { parseScenes } from '../lib/parse-scenes';
import './media.css';
import './briefs.css';
import './review.css';

const ReviewCreativeDocument = graphql(`query ReviewCreative($id: ID!) { creative(id: $id) { id briefTitle locale type status variantIndex revision koreanText scenesJson minorFlagged minorFlagNote briefImages { id url quality instructions createdAt costEstimateUsd } images { id url quality instructions createdAt costEstimateUsd } videos { id url seconds size costEstimateUsd createdAt } localizations { id kind locale text koBackTranslation createdAt } policyChecks { id checkType status detailJson createdAt } reviewEvents { id kind actorId note createdAt } experimentVariants { id variantCode trackingCode exportedAt } } }`);
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
const GenerateCreativeImagesDocument = graphql(`mutation ReviewGenerateCreativeImages($input: GenerateCreativeImagesInput!) { generateCreativeImages(input: $input) { id status } }`);
const GenerateCreativeVideoDocument = graphql(`mutation ReviewGenerateCreativeVideo($input: GenerateCreativeVideoInput!) { generateCreativeVideo(input: $input) { id status } }`);

export function ReviewDetailPage() {
  const { lang, t } = useT();
  const { id } = useParams<{ id: string }>();
  const [pollFast, setPollFast] = useState(false);
  const { data, refetch } = useQuery(ReviewCreativeDocument, { variables: { id: id! }, skip: !id, pollInterval: pollFast ? 3000 : 30_000, fetchPolicy: 'cache-and-network', nextFetchPolicy: 'cache-first' });
  const { data: experimentsData, refetch: refetchExperiments } = useQuery(ReviewExperimentsDocument);
  const { data: meData } = useQuery(ReviewMeDocument);
  const [runPolicyCheck] = useMutation(RunPolicyCheckDocument); const [requestReview] = useMutation(RequestReviewDocument);
  const [reviseLocalization] = useMutation(ReviseLocalizationDocument); const [approveLocalization] = useMutation(ApproveLocalizationDocument);
  const [approveCreative] = useMutation(ApproveCreativeDocument); const [requestRevision] = useMutation(RequestRevisionDocument);
  const [rejectCreative] = useMutation(RejectCreativeDocument); const [releaseMinorFlag] = useMutation(ReleaseMinorFlagDocument);
  const [addToExperiment] = useMutation(AddCreativeToExperimentDocument);
  const [generateCreativeImages] = useMutation(GenerateCreativeImagesDocument);
  const [generateCreativeVideo] = useMutation(GenerateCreativeVideoDocument);
  const [localizationEdit, setLocalizationEdit] = useState<string | null>(null); const [revisionReason, setRevisionReason] = useState('');
  const [rejectionReason, setRejectionReason] = useState(''); const [minorReason, setMinorReason] = useState('');
  const [experimentSelection, setExperimentSelection] = useState(''); const [error, setError] = useState<string | null>(null);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imageInstructions, setImageInstructions] = useState('');
  const [imageCount, setImageCount] = useState(2);
  const [imageQuality, setImageQuality] = useState<'low' | 'high'>('low');
  const [imageJobId, setImageJobId] = useState<string | null>(null);
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [videoInstructions, setVideoInstructions] = useState('');
  const [videoSeconds, setVideoSeconds] = useState<4 | 8 | 12>(12);
  const [videoJobId, setVideoJobId] = useState<string | null>(null);
  // 정책 검사도 비동기 잡 — 잡 완료를 추적해야 30초 폴링 주기를 기다리지 않고 상태 전이가 보인다
  const [policyJobId, setPolicyJobId] = useState<string | null>(null);
  const imageJob = useJobPolling(imageJobId);
  const videoJob = useJobPolling(videoJobId);
  const policyJob = useJobPolling(policyJobId);
  const creative = data?.creative; const latestLocalization = creative?.localizations[0];
  const role = meData?.me.role; const canApprove = role === UserRole.Admin || role === UserRole.Reviewer;
  const selectedExperiment = experimentSelection || experimentsData?.experiments[0]?.id || '';
  async function act(operation: () => Promise<unknown>, alsoExperiments = false) { setError(null); try { await operation(); await refetch(); if (alsoExperiments) await refetchExperiments(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }
  useEffect(() => {
    setPollFast(Boolean(imageJobId || videoJobId || policyJobId));
  }, [imageJobId, videoJobId, policyJobId]);
  useEffect(() => {
    if (!policyJob) return;
    if (policyJob.status === JobStatus.Failed) {
      setError(policyJob.error ?? t('review.policy'));
      setPolicyJobId(null);
      return;
    }
    if (policyJob.status !== JobStatus.Succeeded) return;
    void refetch();
    setPolicyJobId(null);
  }, [policyJob, policyJob?.status, refetch, t]);
  useEffect(() => {
    if (imageJob?.status === JobStatus.Failed) {
      setError(imageJob.error ?? t('review.visualGenerationFailed'));
      setImageJobId(null);
      return;
    }
    if (imageJob?.status !== JobStatus.Succeeded) return;
    void refetch();
    setImageJobId(null);
  }, [imageJob?.error, imageJob?.status, refetch, t]);
  useEffect(() => {
    if (videoJob?.status === JobStatus.Failed) {
      setError(videoJob.error ?? t('review.visualGenerationFailed'));
      setVideoJobId(null);
      return;
    }
    if (videoJob?.status !== JobStatus.Succeeded) return;
    void refetch();
    setVideoJobId(null);
  }, [refetch, t, videoJob?.error, videoJob?.status]);

  async function onGenerateImages(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const result = await generateCreativeImages({
        variables: {
          input: {
            creativeId: id!,
            instructions: imageInstructions || undefined,
            count: imageCount,
            quality: imageQuality,
          },
        },
      });
      setImageJobId(result.data!.generateCreativeImages.id);
      setImageModalOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function onGenerateVideo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const result = await generateCreativeVideo({
        variables: {
          input: {
            creativeId: id!,
            seconds: videoSeconds,
            instructions: videoInstructions || undefined,
          },
        },
      });
      setVideoJobId(result.data!.generateCreativeVideo.id);
      setVideoModalOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  if (!creative) return <section><p className="muted">{t('review.loading')}</p></section>;
  const visualJobActive = Boolean(imageJobId || videoJobId);
  return <section className="review-page stage-review ad-detail">
    <Link className="back-link" to="/review">{t('review.back')}</Link>
    <header className="page-header">
      <div>
        <div className="page-header-title-row"><h1>{creative.briefTitle}</h1>{creative.type === CreativeType.VideoScript ? <span className="tag tag-video">{t('review.typeVideoScript')}</span> : <span className="tag">{t('review.typeCopy')}</span>}<StatusBadge status={creative.status} /></div>
        <p>{t('review.variantRevision', { variant: creative.variantIndex, revision: creative.revision })}</p>
      </div>
      <div className="page-header-actions">
        {creative.status === CreativeStatus.Draft && <Button variant="primary" size="sm" data-hint={t('review.policyHint')} onClick={() => void act(async () => { const result = await runPolicyCheck({ variables: { input: { creativeId: creative.id } } }); setPolicyJobId(result.data!.runPolicyCheck.id); })}>{t('review.policy')}</Button>}
        {creative.status === CreativeStatus.PolicyChecked && <Button variant="primary" size="sm" data-hint={t('review.requestHint')} onClick={() => void act(() => requestReview({ variables: { input: { creativeId: creative.id } } }))}>{t('review.request')}</Button>}
        {creative.status === CreativeStatus.LocalizationApproved && canApprove && <Button variant="primary" size="sm" data-hint={t('review.finalApproveHint')} onClick={() => void act(() => approveCreative({ variables: { input: { creativeId: creative.id } } }))}>{t('review.finalApprove')}</Button>}
        {creative.status === CreativeStatus.Approved && creative.type === CreativeType.Copy && (
          <div className="creative-generation-action">
            <Button variant="primary" size="sm" disabled={visualJobActive} data-hint={t('review.copyImageCostHint')} onClick={() => setImageModalOpen(true)}>{t('review.generateCopyImages')}</Button>
            <small>{t('review.copyImageCostHint')}</small>
          </div>
        )}
        {creative.status === CreativeStatus.Approved && creative.type === CreativeType.VideoScript && (
          <div className="creative-generation-action">
            <Button variant="primary" size="sm" disabled={visualJobActive} data-hint={t('review.videoCostHint')} onClick={() => setVideoModalOpen(true)}>{t('review.generateVideo')}</Button>
            <small>{t('review.videoCostHint')}</small>
          </div>
        )}
      </div>
    </header>
    {error && <p className="error" role="alert">{error}</p>}
    {imageJob && imageJob.status !== JobStatus.Succeeded && imageJob.status !== JobStatus.Failed && <p>{t('review.copyImagesGenerating', { status: imageJob.status })}</p>}
    {videoJob && videoJob.status !== JobStatus.Succeeded && videoJob.status !== JobStatus.Failed && <p>{t('review.videoGenerating', { status: videoJob.status })}</p>}

    <Modal title={t('review.generateCopyImages')} open={imageModalOpen} onClose={() => setImageModalOpen(false)}>
      <p className="muted">{t('review.copyImageModalDescription')}</p>
      <p className="image-workflow-hint">{t('review.copyImageCostHint')}</p>
      <form className="page-form" onSubmit={onGenerateImages}>
        <FormField label={t('briefs.imageInstructions')} htmlFor="creative-image-instructions">
          <textarea id="creative-image-instructions" value={imageInstructions} placeholder={t('briefs.imageInstructionsPlaceholder')} onChange={(event) => setImageInstructions(event.target.value)} />
        </FormField>
        <div className="image-example-block">
          <span className="facet-label">{t('briefs.imageExamplesTitle')}</span>
          <div className="tag-row">
            {[1, 2, 3].map((index) => {
              const example = t(`briefs.imageExample${index}`);
              return <button type="button" className="tag image-example-chip" key={index} onClick={() => setImageInstructions(example)}>{example.slice(0, 34)}…</button>;
            })}
          </div>
        </div>
        <details className="csv-guide">
          <summary>{t('briefs.imageTipsTitle')}</summary>
          <ul className="guide-list">
            {[1, 2, 3, 4, 5].map((index) => <li key={index}>{t(`briefs.imageTip${index}`)}</li>)}
          </ul>
        </details>
        <div className="brief-fields">
          <FormField label={t('briefs.imageCount')} htmlFor="creative-image-count">
            <select id="creative-image-count" value={imageCount} onChange={(event) => setImageCount(Number(event.target.value))}>
              {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{t('briefs.imageCountOption', { count })}</option>)}
            </select>
          </FormField>
          <FormField label={t('briefs.imageQuality')} htmlFor="creative-image-quality">
            <select id="creative-image-quality" value={imageQuality} onChange={(event) => setImageQuality(event.target.value as 'low' | 'high')}>
              <option value="low">{t('briefs.imageQualityLow')}</option>
              <option value="high">{t('briefs.imageQualityHigh')}</option>
            </select>
          </FormField>
        </div>
        <div className="upload-zone">
          <span className="form-hint">{t('briefs.imageCostNotice')}</span>
          <Button variant="primary" type="submit" disabled={visualJobActive}>{t('briefs.startGeneration')}</Button>
        </div>
      </form>
    </Modal>

    <Modal title={t('review.generateVideo')} open={videoModalOpen} onClose={() => setVideoModalOpen(false)}>
      <p className="muted">{t('review.videoModalDescription')}</p>
      <p className="image-workflow-hint">{t('review.videoCostHint')}</p>
      <form className="page-form" onSubmit={onGenerateVideo}>
        <FormField label={t('review.videoSeconds')} htmlFor="creative-video-seconds">
          <select id="creative-video-seconds" value={videoSeconds} onChange={(event) => setVideoSeconds(Number(event.target.value) as 4 | 8 | 12)}>
            {([4, 8, 12] as const).map((seconds) => <option key={seconds} value={seconds}>{t('review.videoSecondsOption', { seconds, cost: (seconds * 0.1).toFixed(2) })}</option>)}
          </select>
        </FormField>
        <FormField label={t('briefs.imageInstructions')} htmlFor="creative-video-instructions">
          <textarea id="creative-video-instructions" value={videoInstructions} placeholder={t('review.videoInstructionsPlaceholder')} onChange={(event) => setVideoInstructions(event.target.value)} />
        </FormField>
        <p className="muted">{t('review.videoDurationNotice')}</p>
        <div className="upload-zone">
          <span className="form-hint">{t('review.videoSelectedCost', { seconds: videoSeconds, cost: (videoSeconds * 0.1).toFixed(2) })}</span>
          <Button variant="primary" type="submit" disabled={visualJobActive}>{t('briefs.startGeneration')}</Button>
        </div>
      </form>
    </Modal>

    {creative.type === CreativeType.VideoScript && (
      <Card className="card-stack">
        <h2>{t('review.sceneTableTitle')}</h2>
        <p className="muted">{t('review.sceneTableGuide')}</p>
        {(() => {
          const scenes = parseScenes(creative.scenesJson);
          return scenes.length === 0 ? <p className="muted">{t('briefs.noSceneData')}</p> : (
            <div className="scene-table-wrap">
              <table className="scene-table">
                <thead><tr><th>{t('briefs.sceneSeconds')}</th><th>{t('briefs.sceneVisual')}</th><th>{t('briefs.sceneDialogue')}</th><th>{t('briefs.sceneCaption')}</th></tr></thead>
                <tbody>{scenes.map((scene, index) => <tr key={`${creative.id}-${index}`}><td>{t('briefs.secondsValue', { seconds: scene.seconds })}</td><td>{scene.visual}</td><td>{scene.dialogue}</td><td>{scene.caption}</td></tr>)}</tbody>
              </table>
            </div>
          );
        })()}
      </Card>
    )}

    <Card className="card-stack">
      <h2>{creative.type === CreativeType.VideoScript ? t('review.latestZh') : t('review.copyTitle')}</h2>
      <div className={creative.type === CreativeType.VideoScript ? 'review-copy-single' : 'review-copy-grid'}>
        {creative.type !== CreativeType.VideoScript && (
          <div>
            <span className="facet-label">{t('review.original')}</span>
            <p className="long-copy">{creative.koreanText}</p>
          </div>
        )}
        <div>
          <span className="facet-label">{t('review.latestZh')}</span>
          <p className="long-copy">{latestLocalization?.text ?? t('review.none')}</p>
          {latestLocalization?.koBackTranslation && (
            <div className="localized-box"><span className="facet-label">{t('review.backTranslation')}</span><p className="long-copy">{latestLocalization.koBackTranslation}</p></div>
          )}
        </div>
      </div>
    </Card>

    {creative.images.length > 0 && (
      <Card className="card-stack">
        <h2>{t('review.creativeImages')}</h2>
        <p className="muted">{t('review.creativeImagesGuide')}</p>
        <div className="brief-image-grid">
          {creative.images.map((image) => (
            <figure className="brief-image-item" key={image.id}>
              <a href={image.url} target="_blank" rel="noreferrer" aria-label={t('review.creativeImageOpen')}>
                <img src={image.url} alt={t('review.creativeImageAlt')} />
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

    {creative.videos.length > 0 && (
      <Card className="card-stack">
        <h2>{t('review.generatedVideos')}</h2>
        <div className="generated-video-grid">
          {creative.videos.map((video) => (
            <figure className="generated-video-item" key={video.id}>
              <video controls preload="metadata" src={video.url} aria-label={t('review.generatedVideoAria')} />
              <figcaption>
                <div className="tag-row">
                  <span className="tag tag-accent">{t('review.videoDuration', { seconds: video.seconds })}</span>
                  <span className="tag">{t('review.videoResolution', { size: video.size })}</span>
                  <span className="tag">{video.costEstimateUsd == null ? t('review.videoCostUnknown') : t('review.videoCost', { cost: video.costEstimateUsd.toFixed(2) })}</span>
                </div>
                <time>{formatDate(String(video.createdAt), lang)}</time>
              </figcaption>
            </figure>
          ))}
        </div>
      </Card>
    )}

    {creative.type !== CreativeType.VideoScript && creative.briefImages.length > 0 && (
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
          <div className="tag-row">{creative.experimentVariants.map((variant) => <span className="tag tag-accent" key={variant.id}>{variant.trackingCode}{variant.exportedAt && <small> · {t('review.exportedAt', { date: formatDate(String(variant.exportedAt), lang) })}</small>}</span>)}</div>
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
