import { useMutation, useQuery } from '@apollo/client';
import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FormField } from '../components/FormField';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import { graphql } from '../generated';
import {
  CopyInfluence,
  CreativeStatus,
  CreativeType,
  GenerationReferenceKind,
  GenerationReferenceRole,
  JobStatus,
  UserRole,
} from '../generated/graphql';
import { useJobPolling } from '../hooks/useJobPolling';
import { formatDate } from '../i18n/format-date';
import { useT } from '../i18n/lang-context';
import { parseScenes } from '../lib/parse-scenes';
import {
  DEFAULT_IMAGE_SIZE_PRESET,
  IMAGE_SIZE_PRESET_OPTIONS,
  ImageSizePresetId,
  imageSizePresetCaption,
  resolveImageSizePresetId,
} from '../lib/image-size-presets';
import {
  AiTypoStyle,
  OVERLAY_COLOR_OPTIONS,
  OVERLAY_FONT_OPTIONS,
  OverlayColor,
  OverlayFont,
  OverlayMode,
  OverlayPresetColor,
  isCustomOverlayColor,
  isOverlayColor,
  overlayPreviewText,
  resolveOverlayPreviewColor,
} from '../lib/overlay-options';
import './media.css';
import './briefs.css';
import './review.css';

const ReviewCreativeDocument = graphql(`query ReviewCreative($id: ID!) { creative(id: $id) { id briefId briefTitle locale type status variantIndex revision koreanText scenesJson minorFlagged minorFlagNote images { id url cleanUrl overlayHeadline overlaySubline overlayMode overlayFont overlayColor copyInfluence quality instructions prompt sizePreset referenceKeys referenceRolesJson createdAt costEstimateUsd } videos { id url seconds size prompt instructions referenceKeys costEstimateUsd createdAt } briefReferenceAds { sourceAdId title thumbnailUrl } localizations { id kind locale text koBackTranslation createdAt } policyChecks { id checkType status detailJson createdAt } reviewEvents { id kind actorId note createdAt } experimentVariants { id variantCode trackingCode exportedAt } } }`);
const ReviewBriefImagesDocument = graphql(`query ReviewBriefImages($id: ID!) { creativeBrief(id: $id) { id images { id url instructions } } }`);
const ReviewReferenceMediaDocument = graphql(`query ReviewReferenceMedia { mediaAssetsPage(input: { origin: MANUAL, offset: 0, limit: 24 }) { items { id originalFilename thumbnailUrl } } }`);
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

type ReferenceOption = {
  kind: GenerationReferenceKind;
  id: string;
  url: string;
  label: string;
};

type SelectedReference = ReferenceOption & {
  roles: GenerationReferenceRole[];
};

type StoredReference = {
  key: string;
  roles: GenerationReferenceRole[];
};

const REFERENCE_ROLES = [
  GenerationReferenceRole.Character,
  GenerationReferenceRole.Style,
  GenerationReferenceRole.Typography,
] as const;

const REFERENCE_ROLE_LABEL_KEYS: Record<GenerationReferenceRole, string> = {
  [GenerationReferenceRole.Character]: 'review.referenceRoleCharacter',
  [GenerationReferenceRole.Style]: 'review.referenceRoleStyle',
  [GenerationReferenceRole.Typography]: 'review.referenceRoleTypography',
};

function parseStoredReferences(value: string | null | undefined): StoredReference[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((reference): StoredReference[] => {
      if (
        typeof reference !== 'object' ||
        reference === null ||
        typeof (reference as StoredReference).key !== 'string'
      ) return [];
      const roles = normalizeReferenceRoles(
        Array.isArray((reference as StoredReference).roles)
          ? (reference as StoredReference).roles
          : [(reference as { role?: GenerationReferenceRole }).role],
      );
      return roles.length > 0 ? [{ key: (reference as StoredReference).key, roles }] : [];
    });
  } catch {
    return [];
  }
}

function normalizeReferenceRoles(roles: unknown[]): GenerationReferenceRole[] {
  return REFERENCE_ROLES.filter((role) => roles.includes(role));
}

function referenceOptionKey(option: Pick<ReferenceOption, 'kind' | 'id'>) {
  return `${option.kind}:${option.id}`;
}

const OVERLAY_FONT_LABEL_KEYS: Record<OverlayFont, string> = {
  gothic: 'review.overlayFontGothic',
  serif: 'review.overlayFontSerif',
  rounded: 'review.overlayFontRounded',
  kai: 'review.overlayFontKai',
  yozai: 'review.overlayFontYozai',
  iansui: 'review.overlayFontIansui',
  genryu: 'review.overlayFontGenryu',
};

const OVERLAY_COLOR_LABEL_KEYS: Record<OverlayPresetColor, string> = {
  white: 'review.overlayColorWhite',
  black: 'review.overlayColorBlack',
  gold: 'review.overlayColorGold',
};

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
  const [imageOverlayHeadline, setImageOverlayHeadline] = useState('');
  const [imageOverlaySubline, setImageOverlaySubline] = useState('');
  const [imageOverlayMode, setImageOverlayMode] = useState<OverlayMode>('SERVER');
  const [imageCopyInfluence, setImageCopyInfluence] = useState<CopyInfluence>(CopyInfluence.Scene);
  const [imageOverlayFont, setImageOverlayFont] = useState<OverlayFont>('gothic');
  const [imageFontPickerOpen, setImageFontPickerOpen] = useState(false);
  const [imageOverlayColor, setImageOverlayColor] = useState<OverlayColor>('white');
  const [imageAiTypoStyle, setImageAiTypoStyle] = useState<AiTypoStyle>('selected');
  const [imageCount, setImageCount] = useState(2);
  const [imageQuality, setImageQuality] = useState<'low' | 'high'>('low');
  const [imageSizePreset, setImageSizePreset] = useState<ImageSizePresetId>(DEFAULT_IMAGE_SIZE_PRESET);
  const [imageReferences, setImageReferences] = useState<SelectedReference[]>([]);
  const [imageJobId, setImageJobId] = useState<string | null>(null);
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [videoInstructions, setVideoInstructions] = useState('');
  const [videoSeconds, setVideoSeconds] = useState<4 | 8 | 12>(12);
  const [videoReferenceImageId, setVideoReferenceImageId] = useState<string | null>(null);
  const [videoJobId, setVideoJobId] = useState<string | null>(null);
  // 정책 검사도 비동기 잡 — 잡 완료를 추적해야 30초 폴링 주기를 기다리지 않고 상태 전이가 보인다
  const [policyJobId, setPolicyJobId] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const imageJob = useJobPolling(imageJobId);
  const videoJob = useJobPolling(videoJobId);
  const policyJob = useJobPolling(policyJobId);
  const hasTypographyReference = imageReferences.some(
    (reference) => reference.roles.includes(GenerationReferenceRole.Typography),
  );
  const selectedOverlayFont = OVERLAY_FONT_OPTIONS.find(
    (font) => font.id === imageOverlayFont,
  )!;
  const overlayPreviewColor = resolveOverlayPreviewColor(imageOverlayColor);
  const customOverlayColor = isCustomOverlayColor(imageOverlayColor)
    ? imageOverlayColor
    : '#7C3AED';
  const autoColorDisabled = imageOverlayMode === 'AI' && imageReferences.length === 0;
  const creative = data?.creative; const latestLocalization = creative?.localizations[0];
  const { data: briefImagesData } = useQuery(ReviewBriefImagesDocument, {
    variables: { id: creative?.briefId ?? '' },
    skip: !creative?.briefId,
  });
  const { data: referenceMediaData } = useQuery(ReviewReferenceMediaDocument);
  const role = meData?.me.role; const canApprove = role === UserRole.Admin || role === UserRole.Reviewer;
  const selectedExperiment = experimentSelection || experimentsData?.experiments[0]?.id || '';
  async function act(operation: () => Promise<unknown>, alsoExperiments = false) { setError(null); setActing(true); try { await operation(); await refetch(); if (alsoExperiments) await refetchExperiments(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setActing(false); } }
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
  useEffect(() => {
    if (!hasTypographyReference && imageAiTypoStyle === 'match_reference') {
      setImageAiTypoStyle('selected');
    }
  }, [hasTypographyReference, imageAiTypoStyle]);
  useEffect(() => {
    if (autoColorDisabled && imageOverlayColor === 'auto') {
      setImageOverlayColor('white');
    }
  }, [autoColorDisabled, imageOverlayColor]);

  function openImageGenerationModal(overlay?: {
    headline?: string | null;
    subline?: string | null;
    mode?: string | null;
    font?: string | null;
    color?: string | null;
    copyInfluence?: string | null;
  }) {
    const truncate = (value: string) => Array.from(value.trim()).slice(0, 60).join('');
    // 긴 문단을 60자에서 뚝 자르면 '就在 Bab'처럼 단어 중간이 잘린다 (운영 실측) — 문장 경계로 나눠 메인·서브에 배분
    const sourceText = (latestLocalization?.text ?? creative?.koreanText ?? '').trim();
    const sentences = sourceText
      .split(/\r?\n/)
      .flatMap((line) => line.match(/[^。！？!?]+[。！？!?]?/g) ?? [])
      .map((sentence) => sentence.trim())
      .filter(Boolean);
    let prefillHeadline = '';
    let sentenceIndex = 0;
    while (sentenceIndex < sentences.length) {
      const candidate = prefillHeadline ? `${prefillHeadline}${sentences[sentenceIndex]}` : sentences[sentenceIndex];
      if (Array.from(candidate).length > 60) break;
      prefillHeadline = candidate;
      sentenceIndex += 1;
    }
    if (!prefillHeadline && sentences.length) prefillHeadline = truncate(sentences[0]);
    let prefillSubline = '';
    while (sentenceIndex < sentences.length) {
      const candidate = prefillSubline ? `${prefillSubline}${sentences[sentenceIndex]}` : sentences[sentenceIndex];
      if (Array.from(candidate).length > 60) break;
      prefillSubline = candidate;
      sentenceIndex += 1;
    }
    setImageOverlayHeadline(overlay ? truncate(overlay.headline ?? '') : prefillHeadline);
    setImageOverlaySubline(overlay ? truncate(overlay.subline ?? '') : prefillSubline);
    setImageOverlayMode(overlay?.mode === 'AI' ? 'AI' : 'SERVER');
    setImageCopyInfluence(
      overlay?.copyInfluence === CopyInfluence.TextOnly
        ? CopyInfluence.TextOnly
        : CopyInfluence.Scene,
    );
    setImageOverlayFont(
      OVERLAY_FONT_OPTIONS.some((font) => font.id === overlay?.font)
        ? overlay!.font as OverlayFont
        : 'gothic',
    );
    setImageFontPickerOpen(false);
    setImageOverlayColor(
      isOverlayColor(overlay?.color)
        ? overlay!.color as OverlayColor
        : 'white',
    );
    setImageAiTypoStyle('selected');
    setImageModalOpen(true);
  }

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
            sizePreset: imageSizePreset,
            overlayHeadline: imageOverlayHeadline.trim() || undefined,
            overlaySubline: imageOverlaySubline.trim() || undefined,
            overlayMode: imageOverlayHeadline.trim() ? imageOverlayMode : undefined,
            copyInfluence: imageOverlayHeadline.trim() ? imageCopyInfluence : undefined,
            overlayFont: imageOverlayHeadline.trim() ? imageOverlayFont : undefined,
            overlayColor: imageOverlayHeadline.trim() ? imageOverlayColor : undefined,
            aiTypoStyle:
              imageOverlayHeadline.trim() && imageOverlayMode === 'AI'
                ? imageAiTypoStyle
                : undefined,
            references: imageReferences.length
              ? imageReferences.map(({ kind, id: referenceId, roles }) => ({
                  kind,
                  id: referenceId,
                  roles,
                }))
              : undefined,
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
            referenceImageId: videoReferenceImageId || undefined,
          },
        },
      });
      setVideoJobId(result.data!.generateCreativeVideo.id);
      setVideoModalOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function toggleImageReference(option: ReferenceOption) {
    const key = referenceOptionKey(option);
    setImageReferences((current) => {
      const selected = current.some((item) => referenceOptionKey(item) === key);
      if (selected) return current.filter((item) => referenceOptionKey(item) !== key);
      if (current.length >= 16) return current;
      return [...current, { ...option, roles: [GenerationReferenceRole.Style] }];
    });
  }

  function toggleImageReferenceRole(option: ReferenceOption, role: GenerationReferenceRole) {
    const key = referenceOptionKey(option);
    setImageReferences((current) =>
      current.map((item) =>
        referenceOptionKey(item) !== key ? item : {
          ...item,
          roles: item.roles.includes(role)
            ? item.roles.length === 1
              ? [GenerationReferenceRole.Style]
              : item.roles.filter((selectedRole) => selectedRole !== role)
            : normalizeReferenceRoles([...item.roles, role]),
        },
      ),
    );
  }

  if (!creative) return <section><p className="muted">{t('review.loading')}</p></section>;
  const briefImageOptions = Array.from(
    new Map(
      [...creative.images, ...(briefImagesData?.creativeBrief.images ?? [])].map((image, index) => {
        const option: ReferenceOption = {
          kind: GenerationReferenceKind.GeneratedImage,
          id: image.id,
          url: image.url,
          label: image.instructions || t('review.briefImageReference', { index: index + 1 }),
        };
        return [referenceOptionKey(option), option];
      }),
    ).values(),
  );
  const sourceAdOptions: ReferenceOption[] = creative.briefReferenceAds.map((ad) => ({
    kind: GenerationReferenceKind.SourceAd,
    id: ad.sourceAdId,
    url: ad.thumbnailUrl,
    label: ad.title || t('review.untitledReferenceAd'),
  }));
  const mediaAssetOptions: ReferenceOption[] = (referenceMediaData?.mediaAssetsPage.items ?? [])
    .filter((asset) => Boolean(asset.thumbnailUrl))
    .map((asset) => ({
      kind: GenerationReferenceKind.MediaAsset,
      id: asset.id,
      url: asset.thumbnailUrl!,
      label: asset.originalFilename,
    }));
  const referenceGroups = [
    { label: t('review.referenceBriefImages'), options: briefImageOptions },
    { label: t('review.referenceAds'), options: sourceAdOptions },
    { label: t('review.referenceMediaAssets'), options: mediaAssetOptions },
  ];
  const referenceRoleCounts = {
    [GenerationReferenceRole.Character]: imageReferences.filter(
      (reference) => reference.roles.includes(GenerationReferenceRole.Character),
    ).length,
    [GenerationReferenceRole.Style]: imageReferences.filter(
      (reference) => reference.roles.includes(GenerationReferenceRole.Style),
    ).length,
    [GenerationReferenceRole.Typography]: imageReferences.filter(
      (reference) => reference.roles.includes(GenerationReferenceRole.Typography),
    ).length,
  };
  const visualJobActive = Boolean(imageJobId || videoJobId);
  // 전이 뮤테이션 실행 중(acting)과 정책 검사 잡 실행 중에도 헤더 액션을 잠근다
  const policyActive = Boolean(policyJobId);
  const headerLocked = acting || policyActive || visualJobActive;
  return <section className="review-page stage-review ad-detail">
    <Link className="back-link" to="/review">{t('review.back')}</Link>
    <header className="page-header">
      <div>
        <div className="page-header-title-row"><h1>{creative.briefTitle}</h1>{creative.type === CreativeType.VideoScript ? <span className="tag tag-video">{t('review.typeVideoScript')}</span> : <span className="tag">{t('review.typeCopy')}</span>}<StatusBadge status={creative.status} /></div>
        <p>{t('review.variantRevision', { variant: creative.variantIndex, revision: creative.revision })}</p>
      </div>
      <div className={`page-header-actions${headerLocked ? ' actions-locked' : ''}`}>
        {creative.status === CreativeStatus.Draft && <Button variant="primary" size="sm" data-hint={t('review.policyHint')} onClick={() => void act(async () => { const result = await runPolicyCheck({ variables: { input: { creativeId: creative.id } } }); setPolicyJobId(result.data!.runPolicyCheck.id); })}>{t('review.policy')}</Button>}
        {creative.status === CreativeStatus.PolicyChecked && <Button variant="primary" size="sm" data-hint={t('review.requestHint')} onClick={() => void act(() => requestReview({ variables: { input: { creativeId: creative.id } } }))}>{t('review.request')}</Button>}
        {creative.status === CreativeStatus.LocalizationApproved && canApprove && <Button variant="primary" size="sm" data-hint={t('review.finalApproveHint')} onClick={() => void act(() => approveCreative({ variables: { input: { creativeId: creative.id } } }))}>{t('review.finalApprove')}</Button>}
        {creative.status === CreativeStatus.Approved && creative.type === CreativeType.Copy && (
          <div className="creative-generation-action">
            <Button variant="primary" size="sm" disabled={visualJobActive} data-hint={t('review.copyImageCostHint')} onClick={() => { setImageReferences([]); setImageSizePreset(DEFAULT_IMAGE_SIZE_PRESET); openImageGenerationModal(); }}>{t('review.generateCopyImages')}</Button>
            <small>{t('review.copyImageCostHint')}</small>
          </div>
        )}
        {creative.status === CreativeStatus.Approved && creative.type === CreativeType.VideoScript && (
          <div className="creative-generation-action">
            <Button variant="primary" size="sm" disabled={visualJobActive} data-hint={t('review.videoCostHint')} onClick={() => { setVideoReferenceImageId(null); setVideoModalOpen(true); }}>{t('review.generateVideo')}</Button>
            <small>{t('review.videoCostHint')}</small>
          </div>
        )}
      </div>
    </header>
    {error && <p className="error" role="alert">{error}</p>}
    {policyActive && <div className="job-banner" role="status"><span className="job-banner-spinner" aria-hidden="true" /><span>{t('ads.jobBanner', { status: policyJob?.status ?? '' })}</span></div>}
    {imageJobId && <div className="job-banner" role="status"><span className="job-banner-spinner" aria-hidden="true" /><span>{t('review.copyImagesGenerating', { status: imageJob?.status ?? '' })}</span></div>}
    {videoJobId && <div className="job-banner" role="status"><span className="job-banner-spinner" aria-hidden="true" /><span>{t('review.videoGenerating', { status: videoJob?.status ?? '' })}</span></div>}

    <Modal title={t('review.generateCopyImages')} open={imageModalOpen} onClose={() => setImageModalOpen(false)}>
      <p className="muted">{t('review.copyImageModalDescription')}</p>
      <p className="image-workflow-hint">💡 {t('briefs.imageWorkflowHint')}</p>
      <form className="page-form" onSubmit={onGenerateImages}>
        <FormField label={t('review.imageSizePreset')} htmlFor="creative-image-size-preset" hint={t('review.imageSizePresetHint')}>
          <select id="creative-image-size-preset" value={imageSizePreset} onChange={(event) => setImageSizePreset(resolveImageSizePresetId(event.target.value))}>
            {IMAGE_SIZE_PRESET_OPTIONS.map((preset) => <option key={preset.id} value={preset.id}>{t(preset.labelKey)}</option>)}
          </select>
        </FormField>
        <section className="overlay-copy-fields" aria-labelledby="overlay-copy-title">
          <h3 id="overlay-copy-title">{t('review.overlayCopyTitle')}</h3>
          <FormField label={t('review.overlayHeadline')} htmlFor="creative-image-overlay-headline">
            <input id="creative-image-overlay-headline" maxLength={60} value={imageOverlayHeadline} onChange={(event) => setImageOverlayHeadline(event.target.value)} /><span className="overlay-char-count">{Array.from(imageOverlayHeadline).length}/60</span>
          </FormField>
          <FormField label={t('review.overlaySubline')} htmlFor="creative-image-overlay-subline">
            <input id="creative-image-overlay-subline" maxLength={60} value={imageOverlaySubline} onChange={(event) => setImageOverlaySubline(event.target.value)} /><span className="overlay-char-count">{Array.from(imageOverlaySubline).length}/60</span>
          </FormField>
          <p className="muted">{t('review.overlayCleanHint')}</p>
          {imageOverlayHeadline.trim() && (
            <div className="overlay-options">
              <fieldset className="overlay-choice-group">
                <legend>{t('review.overlayMode')}</legend>
                <div className="overlay-mode-cards">
                <label className={`overlay-mode-card${imageOverlayMode === 'SERVER' ? ' is-selected' : ''}`}>
                  <input type="radio" name="overlay-mode" value="SERVER" checked={imageOverlayMode === 'SERVER'} onChange={() => setImageOverlayMode('SERVER')} />
                  <span><strong>{t('review.overlayModeServer')}</strong><small>{t('review.overlayModeServerDescription')}</small></span>
                </label>
                <label className={`overlay-mode-card${imageOverlayMode === 'AI' ? ' is-selected' : ''}`}>
                  <input type="radio" name="overlay-mode" value="AI" checked={imageOverlayMode === 'AI'} onChange={() => setImageOverlayMode('AI')} />
                  <span><strong>{t('review.overlayModeAi')}</strong><small>{t('review.overlayModeAiDescription')}</small></span>
                </label>
                </div>
              </fieldset>
              <fieldset className="overlay-choice-group">
                <legend>{t('review.copyInfluence')}</legend>
                <label>
                  <input type="radio" name="copy-influence" value={CopyInfluence.Scene} checked={imageCopyInfluence === CopyInfluence.Scene} onChange={() => setImageCopyInfluence(CopyInfluence.Scene)} />
                  <span>{t('review.copyInfluenceScene')}</span>
                </label>
                <label>
                  <input type="radio" name="copy-influence" value={CopyInfluence.TextOnly} checked={imageCopyInfluence === CopyInfluence.TextOnly} onChange={() => setImageCopyInfluence(CopyInfluence.TextOnly)} />
                  <span>{t('review.copyInfluenceTextOnly')}</span>
                </label>
              </fieldset>
              <p className="muted">{t('review.copyInfluenceTextOnlyHint')}</p>
              {imageOverlayMode === 'SERVER' && <fieldset className="overlay-font-picker">
                <legend>{t('review.overlayFont')}</legend>
                <div className="overlay-selected-font">
                  <div className="overlay-font-card is-selected">
                    <span className="overlay-font-preview" style={{ fontFamily: `'${selectedOverlayFont.family}'`, color: overlayPreviewColor?.value ?? '#FFFFFF', textShadow: overlayPreviewColor ? `2px 2px 0 ${overlayPreviewColor.shadow}` : 'none' }}>
                      {overlayPreviewText(imageOverlayHeadline, latestLocalization?.text)}
                    </span>
                    <span className="overlay-font-label">{t(selectedOverlayFont.labelKey)}</span>
                    {imageOverlayColor === 'auto' && <span className="overlay-color-auto-badge">{t('review.overlayColorAutoBadge')}</span>}
                  </div>
                  <button type="button" className="overlay-font-toggle" aria-expanded={imageFontPickerOpen} onClick={() => setImageFontPickerOpen((open) => !open)}>
                    {t(imageFontPickerOpen ? 'review.overlayFontClose' : 'review.overlayFontMore')}
                  </button>
                </div>
                {imageFontPickerOpen && <div className="overlay-font-grid">
                  {OVERLAY_FONT_OPTIONS.map((font) => (
                    <label className={`overlay-font-card${imageOverlayFont === font.id ? ' is-selected' : ''}`} key={font.id}>
                      <input type="radio" name="overlay-font" value={font.id} checked={imageOverlayFont === font.id} onChange={() => { setImageOverlayFont(font.id); setImageFontPickerOpen(false); }} />
                      <span className="overlay-font-preview" style={{ fontFamily: `'${font.family}'`, color: overlayPreviewColor?.value ?? '#FFFFFF', textShadow: overlayPreviewColor ? `2px 2px 0 ${overlayPreviewColor.shadow}` : 'none' }}>
                        {overlayPreviewText(imageOverlayHeadline, latestLocalization?.text)}
                      </span>
                      <span className="overlay-font-label">{t(font.labelKey)}</span>
                    </label>
                  ))}
                </div>}
              </fieldset>
              }
              {imageOverlayMode === 'AI' && (
                <fieldset className="overlay-choice-group overlay-ai-styles">
                  <legend>{t('review.aiTypoStyle')}</legend>
                  <div className="overlay-ai-selected-row">
                    <label><input type="radio" name="ai-typo-style" value="selected" checked={imageAiTypoStyle === 'selected'} onChange={() => setImageAiTypoStyle('selected')} /><span>{t('review.aiTypoSelected')}</span></label>
                    <select aria-label={t('review.aiTypoFontFamily')} value={imageOverlayFont} disabled={imageAiTypoStyle !== 'selected'} onChange={(event) => setImageOverlayFont(event.target.value as OverlayFont)}>
                      {OVERLAY_FONT_OPTIONS.map((font) => <option key={font.id} value={font.id}>{t(font.labelKey).replace(/\s*\([^)]*\)\s*$/, '')}</option>)}
                    </select>
                  </div>
                  <label className={!hasTypographyReference ? 'is-disabled' : ''}><input type="radio" name="ai-typo-style" value="match_reference" disabled={!hasTypographyReference} checked={imageAiTypoStyle === 'match_reference'} onChange={() => setImageAiTypoStyle('match_reference')} /><span>{t('review.aiTypoMatchReference')}</span></label>
                  <label><input type="radio" name="ai-typo-style" value="auto" checked={imageAiTypoStyle === 'auto'} onChange={() => setImageAiTypoStyle('auto')} /><span>{t('review.aiTypoAuto')}</span></label>
                  {!hasTypographyReference && <small className="overlay-ai-reference-hint">{t('review.aiTypoMatchReferenceHint')}</small>}
                </fieldset>
              )}
              <fieldset className="overlay-color-picker">
                <legend>{t('review.overlayColor')}</legend>
                <div className="overlay-color-options">
                  {OVERLAY_COLOR_OPTIONS.map((color) => (
                    <label className={`overlay-color-option${imageOverlayColor === color.id ? ' is-selected' : ''}`} key={color.id}>
                      <input type="radio" name="overlay-color" value={color.id} checked={imageOverlayColor === color.id} onChange={() => setImageOverlayColor(color.id)} />
                      <span className="overlay-color-swatch" style={{ backgroundColor: color.value }} aria-hidden="true" />
                      <span>{t(color.labelKey)}</span>
                    </label>
                  ))}
                  <label
                    className={`overlay-color-option${imageOverlayColor === 'auto' ? ' is-selected' : ''}${autoColorDisabled ? ' is-disabled' : ''}`}
                    title={imageOverlayMode === 'SERVER' && imageReferences.length === 0 ? t('review.overlayColorAutoGeneratedHint') : undefined}
                  >
                    <input type="radio" name="overlay-color" value="auto" disabled={autoColorDisabled} checked={imageOverlayColor === 'auto'} onChange={() => setImageOverlayColor('auto')} />
                    <span className="overlay-color-auto-icon" aria-hidden="true">◐</span>
                    <span>{t('review.overlayColorAutoReference')}</span>
                  </label>
                  <label className={`overlay-color-option overlay-custom-color${isCustomOverlayColor(imageOverlayColor) ? ' is-selected' : ''}`}>
                    <input aria-label={t('review.overlayColorCustom')} type="color" value={customOverlayColor} onChange={(event) => setImageOverlayColor(event.target.value as `#${string}`)} />
                    <span>{t('review.overlayColorCustom')}</span>
                  </label>
                </div>
              </fieldset>
            </div>
          )}
        </section>
        <section className="reference-picker" aria-labelledby="image-reference-title">
          <div className="reference-picker-header">
            <h3 id="image-reference-title">{t('review.referenceImages')}</h3>
            <strong>{t('review.referenceSelectionSummary', {
              count: imageReferences.length,
              character: referenceRoleCounts[GenerationReferenceRole.Character],
              style: referenceRoleCounts[GenerationReferenceRole.Style],
              typography: referenceRoleCounts[GenerationReferenceRole.Typography],
            })}</strong>
          </div>
          <p className="muted">{t('review.referenceImagesGuide')}</p>
          {referenceGroups.map((group) => (
            <div className="reference-group" key={group.label}>
              <span className="facet-label">{group.label}</span>
              {group.options.length > 0 ? (
                <div className="reference-thumbnail-row">
                  {group.options.map((option) => {
                    const selectedReference = imageReferences.find(
                      (item) => referenceOptionKey(item) === referenceOptionKey(option),
                    );
                    const selected = Boolean(selectedReference);
                    return (
                      <div
                        className={`reference-thumbnail reference-thumbnail-selectable${selected ? ' is-selected' : ''}${!selected && imageReferences.length >= 16 ? ' is-disabled' : ''}`}
                        key={referenceOptionKey(option)}
                      >
                        <button
                          type="button"
                          className="reference-thumbnail-toggle"
                          aria-label={t('review.toggleReferenceImage', { name: option.label })}
                          aria-pressed={selected}
                          disabled={!selected && imageReferences.length >= 16}
                          onClick={() => toggleImageReference(option)}
                        >
                          <img src={option.url} alt={option.label} />
                          <span className="reference-check" aria-hidden="true">✓</span>
                          <span className="reference-thumbnail-label">{option.label}</span>
                        </button>
                        {selectedReference && (
                          <div className="reference-role-chips">
                            {REFERENCE_ROLES.map((referenceRole) => (
                              <button
                                type="button"
                                className={selectedReference.roles.includes(referenceRole) ? 'is-selected' : ''}
                                key={referenceRole}
                                aria-label={t('review.selectReferenceRole', {
                                  name: option.label,
                                  role: t(REFERENCE_ROLE_LABEL_KEYS[referenceRole]),
                                })}
                                aria-pressed={selectedReference.roles.includes(referenceRole)}
                                onClick={() => toggleImageReferenceRole(option, referenceRole)}
                              >
                                {t(REFERENCE_ROLE_LABEL_KEYS[referenceRole])}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : <p className="muted reference-empty">{t('review.noReferenceImages')}</p>}
            </div>
          ))}
        </section>
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
        <section className="reference-picker" aria-labelledby="video-reference-title">
          <div className="reference-picker-header">
            <h3 id="video-reference-title">{t('review.videoFirstFrame')}</h3>
          </div>
          <p className="muted">{t('review.videoFirstFrameGuide')}</p>
          <div className="reference-thumbnail-row reference-radio-row">
            <label className={`reference-thumbnail reference-none${videoReferenceImageId === null ? ' is-selected' : ''}`}>
              <input type="radio" name="video-reference-image" checked={videoReferenceImageId === null} onChange={() => setVideoReferenceImageId(null)} />
              <span className="reference-none-label">{t('review.noFirstFrame')}</span>
            </label>
            {briefImageOptions.map((option) => (
              <label className={`reference-thumbnail${videoReferenceImageId === option.id ? ' is-selected' : ''}`} key={option.id}>
                <input type="radio" name="video-reference-image" value={option.id} checked={videoReferenceImageId === option.id} onChange={() => setVideoReferenceImageId(option.id)} />
                <img src={option.url} alt={option.label} />
                <span className="reference-check" aria-hidden="true">✓</span>
                <span className="reference-thumbnail-label">{option.label}</span>
              </label>
            ))}
          </div>
        </section>
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
          {creative.images.map((image) => {
            const sizeCaption = imageSizePresetCaption(image.sizePreset);
            const storedOverlayColor = isOverlayColor(image.overlayColor)
              ? image.overlayColor
              : 'white';
            const storedCustomColor = isCustomOverlayColor(storedOverlayColor);
            const storedOverlayColorLabel = storedOverlayColor === 'auto'
              ? t('review.overlayColorAutomatic')
              : storedCustomColor
                ? storedOverlayColor
                : t(OVERLAY_COLOR_LABEL_KEYS[storedOverlayColor]);
            const storedOverlayColorCaption = <span className="overlay-caption-color">
              {storedCustomColor && <span className="overlay-caption-swatch" style={{ backgroundColor: storedOverlayColor }} aria-hidden="true" />}
              {storedOverlayColorLabel}
            </span>;
            const storedReferences = parseStoredReferences(image.referenceRolesJson);
            const roleComposition = REFERENCE_ROLES.map((referenceRole) => {
              const count = storedReferences.filter(
                (reference) => reference.roles.includes(referenceRole),
              ).length;
              return count;
            });
            const inheritedRoles = storedReferences[0]?.roles ?? [GenerationReferenceRole.Style];
            return (
            <figure className="brief-image-item" key={image.id}>
              <a href={image.url} target="_blank" rel="noreferrer" aria-label={t('review.creativeImageOpen')}>
                <img src={image.url} alt={t('review.creativeImageAlt')} />
              </a>
              <figcaption>
                <div className="tag-row">
                  <span className="tag tag-accent">{image.quality === 'high' ? t('briefs.qualityHigh') : t('briefs.qualityLow')}</span>
                  <span className="tag">{image.costEstimateUsd == null ? t('briefs.costUnknown') : t('briefs.imageCost', { cost: image.costEstimateUsd.toFixed(2) })}</span>
                  {sizeCaption && <span className="tag">{sizeCaption}</span>}
                  {image.referenceKeys.length > 0 && <span className="tag">{storedReferences.length > 0
                    ? t('review.referenceComposition', {
                      count: image.referenceKeys.length,
                      character: roleComposition[0],
                      style: roleComposition[1],
                      typography: roleComposition[2],
                    })
                    : t('review.referenceCount', { count: image.referenceKeys.length })}</span>}
                  {image.overlayHeadline && image.overlayMode === 'AI' && <span className="tag">{t('review.aiTypographyApplied')} · {storedOverlayColorCaption}</span>}
                  {image.overlayHeadline && image.overlayMode !== 'AI' && <span className="tag">{t('review.overlayApplied')} · {t(OVERLAY_FONT_LABEL_KEYS[(image.overlayFont ?? 'gothic') as OverlayFont])} · {storedOverlayColorCaption}</span>}
                  {image.copyInfluence === CopyInfluence.TextOnly && <span className="tag">{t('review.copyInfluenceTextOnlyTag')}</span>}
                  {image.overlayHeadline && image.overlayMode !== 'AI' && image.cleanUrl && <a className="tag" href={image.cleanUrl} download>{t('review.cleanOriginal')}</a>}
                </div>
                <p>{image.instructions || t('briefs.noImageInstructions')}</p>
                <details className="prompt-detail">
                  <summary>{t('briefs.promptDetail')}</summary>
                  <pre>{image.prompt}</pre>
                </details>
                {creative.status === CreativeStatus.Approved && (
                  <button type="button" className="tag image-example-chip" onClick={() => { setImageInstructions(image.instructions); setImageSizePreset(resolveImageSizePresetId(image.sizePreset)); setImageReferences([{ kind: GenerationReferenceKind.GeneratedImage, id: image.id, url: image.url, label: image.instructions || t('review.briefImageReference', { index: 1 }), roles: inheritedRoles }]); openImageGenerationModal({ headline: image.overlayHeadline, subline: image.overlaySubline, mode: image.overlayMode, font: image.overlayFont, color: image.overlayColor, copyInfluence: image.copyInfluence }); }}>{t('review.reuseInstructions')}</button>
                )}
                <time>{formatDate(String(image.createdAt), lang)}</time>
              </figcaption>
            </figure>
            );
          })}
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
                  {video.referenceKeys.length > 0 && <span className="tag">{t('review.referenceCount', { count: video.referenceKeys.length })}</span>}
                </div>
                <details className="prompt-detail">
                  <summary>{t('briefs.promptDetail')}</summary>
                  <pre>{video.prompt}</pre>
                </details>
                {creative.status === CreativeStatus.Approved && (
                  <button type="button" className="tag image-example-chip" onClick={() => { setVideoInstructions(video.instructions ?? ''); setVideoReferenceImageId(null); setVideoModalOpen(true); }}>{t('review.reuseInstructions')}</button>
                )}
                <time>{formatDate(String(video.createdAt), lang)}</time>
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
            <Button size="sm" disabled={acting} onClick={() => void act(() => releaseMinorFlag({ variables: { input: { creativeId: creative.id, reason: minorReason } } }))}>{t('review.releaseMinor')}</Button>
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
            <Button size="sm" disabled={acting} data-hint={t('review.saveEditHint')} onClick={() => void act(() => reviseLocalization({ variables: { input: { creativeId: creative.id, text: localizationEdit ?? latestLocalization?.text ?? '' } } }))}>{t('review.saveEdit')}</Button>
            {canApprove && <Button variant="primary" size="sm" disabled={acting} data-hint={t('review.approveLocalizationHint')} onClick={() => void act(() => approveLocalization({ variables: { input: { creativeId: creative.id } } }))}>{t('review.approveLocalization')}</Button>}
          </div>
        </div>
        <hr className="review-divider" />
        <div className="review-reason-row">
          <label>{t('review.revisionReason')}<input value={revisionReason} onChange={(event) => setRevisionReason(event.target.value)} /></label>
          <Button size="sm" disabled={acting} data-hint={t('review.requestRevisionHint')} onClick={() => void act(() => requestRevision({ variables: { input: { creativeId: creative.id, reason: revisionReason } } }))}>{t('review.requestRevision')}</Button>
        </div>
        <div className="review-reason-row">
          <label>{t('review.rejectionReason')}<input value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} /></label>
          <Button size="sm" disabled={acting} data-hint={t('review.rejectHint')} onClick={() => void act(() => rejectCreative({ variables: { input: { creativeId: creative.id, reason: rejectionReason } } }))}>{t('review.reject')}</Button>
        </div>
      </Card>
    )}

    {creative.status === CreativeStatus.Approved && (
      <Card className="card-stack">
        <h2>{t('review.addExperiment')}</h2>
        <div className="experiment-add-row">
          <label>{t('review.experimentSelection')}<select value={selectedExperiment} onChange={(event) => setExperimentSelection(event.target.value)}>{experimentsData?.experiments.map((experiment) => <option key={experiment.id} value={experiment.id}>{experiment.name}</option>)}</select></label>
          <Button variant="primary" size="sm" data-hint={t('review.addExperimentHint')} disabled={!selectedExperiment || acting} onClick={() => void act(() => addToExperiment({ variables: { input: { creativeId: creative.id, experimentId: selectedExperiment } } }), true)}>{t('review.addExperiment')}</Button>
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
