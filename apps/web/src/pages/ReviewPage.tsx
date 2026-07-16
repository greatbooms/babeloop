import { useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';
import { graphql } from '../generated';
import { CreativeStatus, UserRole } from '../generated/graphql';

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
    <main>
      <h1>검토</h1>
      {error && <p role="alert">{error}</p>}
      <ul>
        {data?.creatives.map((creative) => {
          const latestLocalization = creative.localizations[0];
          const selectedExperiment =
            experimentSelections[creative.id] ?? experimentsData?.experiments[0]?.id ?? '';
          return (
            <li key={creative.id}>
              <h2>{creative.briefTitle}</h2>
              <p><strong>{creative.status}</strong> · revision {creative.revision}</p>
              <p>{creative.koreanText.length > 240 ? `${creative.koreanText.slice(0, 240)}…` : creative.koreanText}</p>
              <p>zh-TW: {latestLocalization?.text ?? '없음'}</p>
              {creative.minorFlagged && (
                <section>
                  <p>⚠️ 미성년자 신호: {creative.minorFlagNote}</p>
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
                <button
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
                <button
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
                  <button
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
                    <button
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
                  <button
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
                  <button
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
                <button
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
                  <button
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
            </li>
          );
        })}
      </ul>
    </main>
  );
}
