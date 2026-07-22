import { useQuery } from '@apollo/client';
import { Link } from 'react-router';
import { Card } from '../components/Card';
import { HelpPanel } from '../components/HelpPanel';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { graphql } from '../generated';
import { useT } from '../i18n/lang-context';

const ReviewCreativesDocument = graphql(`
  query ReviewCreatives {
    creatives { id briefTitle status revision koreanText minorFlagged }
  }
`);

export function ReviewPage() {
  const { t } = useT();
  const { data } = useQuery(ReviewCreativesDocument, { pollInterval: 3000 });
  return (
    <section className="review-page stage-review">
      <PageHeader title={t('review.title')} step={t('review.step')} description={t('review.description')} />
      <HelpPanel page="review" />
      <ul className="card-list">
        {data?.creatives.map((creative) => (
          <li key={creative.id}>
            <Link className="brand-list-card" to={`/review/${creative.id}`}>
              <Card className="card-stack review-card">
                <div className="inline-actions"><StatusBadge status={creative.status} /><span className="muted">{t('review.revision', { revision: creative.revision })}</span>{creative.minorFlagged && <span title={t('review.minorFlag')}>⚠</span>}</div>
                <p>{creative.koreanText.length > 60 ? `${creative.koreanText.slice(0, 60)}…` : creative.koreanText}</p>
                <p className="muted">{creative.briefTitle}</p>
                <span className="brand-detail-cta">{t('common.detail')}</span>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
