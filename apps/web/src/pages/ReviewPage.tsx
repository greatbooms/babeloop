import { useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';
import { graphql } from '../generated';
import { CreativeStatus, UserRole } from '../generated/graphql';
import { Card } from '../components/Card';
import { PageHeader } from '../components/PageHeader';
import { HelpPanel } from '../components/HelpPanel';
import { StatusBadge } from '../components/StatusBadge';

const ReviewCreativesDocument = graphql(`
  query ReviewCreatives {
    creatives {
      id briefTitle locale type status variantIndex revision hookType koreanText
      minorFlagged minorFlagNote createdById lastEditedById
      localizations { id kind locale text createdAt }
      policyChecks { id checkType status detailJson createdAt }
      experimentVariants { id variantCode trackingCode }
    }
  }
`);

const ReviewExperimentsDocument = graphql(`
  query ReviewExperiments {
    experiments { id code name }
  }
`);

const ReviewMeDocument = graphql(`
  query ReviewMe { me { id role } }
`);

const RunPolicyCheckDocument = graphql(`
  mutation ReviewRunPolicyCheck($input: CreativeIdInput!) {
    runPolicyCheck(input: $input) { id status }
  }
`);
const RequestReviewDocument = graphql(`
  mutation ReviewRequestCreative($input: CreativeIdInput!) {
    requestCreativeReview(input: $input) { id status }
  }
`);
const ReviseLocalizationDocument = graphql(`
  mutation ReviewReviseLocalization($input: ReviseLocalizationInput!) {
    reviseLocalization(input: $input) { id status }
  }
`);
const ApproveLocalizationDocument = graphql(`
  mutation ReviewApproveLocalization($input: CreativeNoteInput!) {
    approveLocalization(input: $input) { id status }
  }
`);
const ApproveCreativeDocument = graphql(`
  mutation ReviewApproveCreative($input: CreativeNoteInput!) {
    approveCreative(input: $input) { id status }
  }
`);
const RequestRevisionDocument = graphql(`
  mutation ReviewRequestRevision($input: CreativeReasonInput!) {
    requestCreativeRevision(input: $input) { id status }
  }
`);
const RejectCreativeDocument = graphql(`
  mutation ReviewRejectCreative($input: CreativeReasonInput!) {
    rejectCreative(input: $input) { id status }
  }
`);
const ReleaseMinorFlagDocument = graphql(`
  mutation ReviewReleaseMinorFlag($input: CreativeReasonInput!) {
    releaseMinorFlag(input: $input) { id minorFlagged }
  }
`);
const AddCreativeToExperimentDocument = graphql(`
  mutation ReviewAddCreativeToExperiment($input: AddCreativeToExperimentInput!) {
    addCreativeToExperiment(input: $input) { id trackingCode }
  }
`);

export function ReviewPage() {
  const { data, refetch } = useQuery(ReviewCreativesDocument, { pollInterval: 3000 });
  const { data: experimentsData, refetch: refetchExperiments } = useQuery(
    ReviewExperimentsDocument,
  );
  const { data: meData } = useQuery(ReviewMeDocument);
  const [runPolicyCheck] = useMutation(RunPolicyCheckDocument);
  const [requestReview] = useMutation(RequestReviewDocument);
  const [reviseLocalization] = useMutation(ReviseLocalizationDocument);
  const [approveLocalization] = useMutation(ApproveLocalizationDocument);
  const [approveCreative] = useMutation(ApproveCreativeDocument);
  const [requestRevision] = useMutation(RequestRevisionDocument);
  const [rejectCreative] = useMutation(RejectCreativeDocument);
  const [releaseMinorFlag] = useMutation(ReleaseMinorFlagDocument);
  const [addToExperiment] = useMutation(AddCreativeToExperimentDocument);
  const [localizationEdits, setLocalizationEdits] = useState<Record<string, string>>({});
  const [revisionReasons, setRevisionReasons] = useState<Record<string, string>>({});
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const [minorReasons, setMinorReasons] = useState<Record<string, string>>({});
  const [experimentSelections, setExperimentSelections] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const role = meData?.me.role;
  const canApprove = role === UserRole.Admin || role === UserRole.Reviewer;

  async function act(operation: () => Promise<unknown>, alsoExperiments = false) {
    setError(null);
    try {
      await operation();
      await refetch();
      if (alsoExperiments) await refetchExperiments();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <section className="review-page stage-review">
      <PageHeader title="검토" step="루프 4단계 — 품질 게이트" description="생성된 문구가 광고로 나가기 전 통과해야 하는 관문입니다. 정책 검사(금지어·유사도·미성년 신호) → 검토 요청 → 검수자의 번체중문 검수·승인 순서이며, 자기가 만든 문구는 자기가 승인할 수 없습니다." />
      <HelpPanel page="review" />
      {error && <p role="alert">{error}</p>}
      <ul className="card-list">
        {data?.creatives.map((creative) => {
          const latestLocalization = creative.localizations[0];
          const selectedExperiment =
            experimentSelections[creative.id] ?? experimentsData?.experiments[0]?.id ?? '';
          return (
            <li key={creative.id}>
              <Card className="card-stack review-card">
              <h2>{creative.briefTitle}</h2>
              <p className="inline-actions"><StatusBadge status={creative.status} /><span className="muted">revision {creative.revision}</span></p>
              <p>{creative.koreanText.length > 240 ? `${creative.koreanText.slice(0, 240)}…` : creative.koreanText}</p>
              <p>zh-TW: {latestLocalization?.text ?? '없음'}</p>
              {creative.minorFlagged && (
                <section className="minor-warning">
                  <p>미성년자 신호: {creative.minorFlagNote}</p>
                  {canApprove && (
                    <>
                      <label>
                        미성년자 해제 사유
                        <input
                          value={minorReasons[creative.id] ?? ''}
                          onChange={(event) =>
                            setMinorReasons((current) => ({
                              ...current,
                              [creative.id]: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <button
                        onClick={() =>
                          void act(() =>
                            releaseMinorFlag({
                              variables: {
                                input: {
                                  creativeId: creative.id,
                                  reason: minorReasons[creative.id] ?? '',
                                },
                              },
                            }),
                          )
                        }
                      >
                        미성년자 플래그 해제
                      </button>
                    </>
                  )}
                </section>
              )}

              {creative.status === CreativeStatus.Draft && (
                <button data-hint="금지어·유사도·미성년 신호를 검사합니다 (AI 비용 발생)"
                  onClick={() =>
                    void act(() =>
                      runPolicyCheck({ variables: { input: { creativeId: creative.id } } }),
                    )
                  }
                >
                  정책 검사
                </button>
              )}
              {creative.status === CreativeStatus.PolicyChecked && (
                <button data-hint="검수자에게 현지화와 승인 검토를 요청합니다 (무료)"
                  onClick={() =>
                    void act(() =>
                      requestReview({ variables: { input: { creativeId: creative.id } } }),
                    )
                  }
                >
                  검토 요청
                </button>
              )}
              {creative.status === CreativeStatus.InReview && (
                <section>
                  <label>
                    zh-TW 수정
                    <textarea
                      value={localizationEdits[creative.id] ?? latestLocalization?.text ?? ''}
                      onChange={(event) =>
                        setLocalizationEdits((current) => ({
                          ...current,
                          [creative.id]: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <button data-hint="수정한 번체중문 문구를 저장합니다 (무료)"
                    onClick={() =>
                      void act(() =>
                        reviseLocalization({
                          variables: {
                            input: {
                              creativeId: creative.id,
                              text: localizationEdits[creative.id] ?? latestLocalization?.text ?? '',
                            },
                          },
                        }),
                      )
                    }
                  >
                    수정 저장
                  </button>
                  {canApprove && (
                    <button data-hint="번체중문 검수를 승인합니다 (무료)"
                      onClick={() =>
                        void act(() =>
                          approveLocalization({
                            variables: { input: { creativeId: creative.id } },
                          }),
                        )
                      }
                    >
                      현지화 승인
                    </button>
                  )}
                  <label>
                    수정 요청 사유
                    <input
                      value={revisionReasons[creative.id] ?? ''}
                      onChange={(event) =>
                        setRevisionReasons((current) => ({
                          ...current,
                          [creative.id]: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <button data-hint="수정 사유와 함께 작성자에게 돌려보냅니다 (무료)"
                    onClick={() =>
                      void act(() =>
                        requestRevision({
                          variables: {
                            input: {
                              creativeId: creative.id,
                              reason: revisionReasons[creative.id] ?? '',
                            },
                          },
                        }),
                      )
                    }
                  >
                    수정 요청
                  </button>
                  <label>
                    거절 사유
                    <input
                      value={rejectionReasons[creative.id] ?? ''}
                      onChange={(event) =>
                        setRejectionReasons((current) => ({
                          ...current,
                          [creative.id]: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <button data-hint="광고 문구를 거절하고 사유를 기록합니다 (무료)"
                    onClick={() =>
                      void act(() =>
                        rejectCreative({
                          variables: {
                            input: {
                              creativeId: creative.id,
                              reason: rejectionReasons[creative.id] ?? '',
                            },
                          },
                        }),
                      )
                    }
                  >
                    거절
                  </button>
                </section>
              )}
              {creative.status === CreativeStatus.LocalizationApproved && canApprove && (
                <button data-hint="검수 완료 문구의 집행을 최종 승인합니다 (무료)"
                  onClick={() =>
                    void act(() =>
                      approveCreative({ variables: { input: { creativeId: creative.id } } }),
                    )
                  }
                >
                  최종 승인
                </button>
              )}
              {creative.status === CreativeStatus.Approved && (
                <section>
                  <label>
                    실험 선택
                    <select
                      value={selectedExperiment}
                      onChange={(event) =>
                        setExperimentSelections((current) => ({
                          ...current,
                          [creative.id]: event.target.value,
                        }))
                      }
                    >
                      {experimentsData?.experiments.map((experiment) => (
                        <option key={experiment.id} value={experiment.id}>{experiment.name}</option>
                      ))}
                    </select>
                  </label>
                  <button data-hint="승인 문구에 실험 추적코드를 발급합니다 (무료)"
                    disabled={!selectedExperiment}
                    onClick={() =>
                      void act(
                        () =>
                          addToExperiment({
                            variables: {
                              input: {
                                creativeId: creative.id,
                                experimentId: selectedExperiment,
                              },
                            },
                          }),
                        true,
                      )
                    }
                  >
                    실험에 추가
                  </button>
                </section>
              )}
              {creative.experimentVariants.map((variant) => (
                <p key={variant.id}>{variant.trackingCode}</p>
              ))}
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
