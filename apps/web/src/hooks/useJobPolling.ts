import { useQuery } from '@apollo/client';
import { useEffect } from 'react';
import { graphql } from '../generated';

const JobDocument = graphql(`
  query Job($id: ID!) { job(id: $id) { id status error finishedAt resultJson } }
`);

/** 설계 원칙: 모든 비동기 작업 상태는 이 훅으로만 읽는다. Subscription 전환 시 이 훅 내부만 교체. */
export function useJobPolling(jobId: string | null) {
  const { data, stopPolling } = useQuery(JobDocument, {
    variables: { id: jobId ?? '' },
    skip: !jobId,
    pollInterval: 2000,
  });

  const status = data?.job?.status;
  useEffect(() => {
    if (status === 'SUCCEEDED' || status === 'FAILED') stopPolling();
  }, [status, stopPolling]);

  return data?.job ?? null;
}
