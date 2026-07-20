import { useQuery } from '@apollo/client';
import { Link } from 'react-router';
import { Card } from '../components/Card';
import { HelpPanel } from '../components/HelpPanel';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { graphql } from '../generated';

const ReviewCreativesDocument = graphql(`
  query ReviewCreatives {
    creatives { id briefTitle status revision koreanText minorFlagged }
  }
`);

export function ReviewPage() {
  const { data } = useQuery(ReviewCreativesDocument, { pollInterval: 3000 });
  return (
    <section className="review-page stage-review">
      <PageHeader title="검토" step="루프 4단계 — 품질 게이트" description="생성된 문구가 광고로 나가기 전 통과해야 하는 관문입니다. 정책 검사(금지어·유사도·미성년 신호) → 검토 요청 → 검수자의 번체중문 검수·승인 순서이며, 자기가 만든 문구는 자기가 승인할 수 없습니다." />
      <HelpPanel page="review" />
      <ul className="card-list">
        {data?.creatives.map((creative) => (
          <li key={creative.id}>
            <Link className="brand-list-card" to={`/review/${creative.id}`}>
              <Card className="card-stack review-card">
                <div className="inline-actions"><StatusBadge status={creative.status} /><span className="muted">revision {creative.revision}</span>{creative.minorFlagged && <span title="미성년자 플래그">⚠</span>}</div>
                <p>{creative.koreanText.length > 60 ? `${creative.koreanText.slice(0, 60)}…` : creative.koreanText}</p>
                <p className="muted">{creative.briefTitle}</p>
                <span className="brand-detail-cta">상세 보기 →</span>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
