import { useQuery } from '@apollo/client';
import { Link } from 'react-router';
import { Card } from '../components/Card';
import { HelpPanel } from '../components/HelpPanel';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { graphql } from '../generated';
import { useT } from '../i18n/lang-context';
import './media.css';
import './briefs.css';
import './review.css';

const ReviewCreativesDocument = graphql(`
  query ReviewCreatives {
    creatives { id briefTitle status revision koreanText minorFlagged }
  }
`);

export function ReviewPage() {
  const { t } = useT();
  const { data } = useQuery(ReviewCreativesDocument, { pollInterval: 3000 });
  const creatives = data?.creatives ?? [];
  return (
    <section className="review-page stage-review">
      <PageHeader title={t('review.title')} step={t('review.step')} description={t('review.description')} />
      <HelpPanel page="review" />
      {creatives.length === 0 ? (
        <Card className="empty-state"><p className="muted">{t('review.empty')}</p></Card>
      ) : (
        <ul className="briefs-grid">
          {creatives.map((creative) => (
            <li key={creative.id}>
              <Card className="brief-card review-list-card">
                <div className="inline-actions">
                  <StatusBadge status={creative.status} />
                  <span className="muted">{t('review.revision', { revision: creative.revision })}</span>
                  {creative.minorFlagged && <span title={t('review.minorFlag')}>⚠</span>}
                </div>
                <p className="review-copy-excerpt">{creative.koreanText.length > 80 ? `${creative.koreanText.slice(0, 80)}…` : creative.koreanText}</p>
                <div className="tag-row"><span className="tag">{creative.briefTitle}</span></div>
                <Link className="brand-detail-cta" to={`/review/${creative.id}`}>{t('common.detail')}</Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
