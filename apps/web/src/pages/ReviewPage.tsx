import { useQuery } from '@apollo/client';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Card } from '../components/Card';
import { FormField } from '../components/FormField';
import { HelpPanel } from '../components/HelpPanel';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { graphql } from '../generated';
import { CreativeStatus } from '../generated/graphql';
import { STATUS_LABELS } from '../lib/status-labels';
import { useT } from '../i18n/lang-context';
import './source-ads.css';
import './media.css';
import './briefs.css';
import './review.css';

const ReviewCreativesDocument = graphql(`
  query ReviewCreatives($status: CreativeStatus, $search: String) {
    creatives(status: $status, search: $search) { id briefTitle status revision koreanText minorFlagged }
  }
`);

export function ReviewPage() {
  const { lang, t } = useT();
  const [status, setStatus] = useState<CreativeStatus | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => { const timer = window.setTimeout(() => setSearch(searchInput), 300); return () => window.clearTimeout(timer); }, [searchInput]);
  const { data } = useQuery(ReviewCreativesDocument, { variables: { status: status || undefined, search: search || undefined }, pollInterval: 3000 });
  const creatives = data?.creatives ?? [];
  return (
    <section className="review-page stage-review">
      <PageHeader title={t('review.title')} step={t('review.step')} description={t('review.description')} />
      <HelpPanel page="review" />
      <div className="filter-bar media-filter-bar">
        <FormField label={t('review.statusFilter')} htmlFor="review-status"><select id="review-status" value={status} onChange={(event) => setStatus(event.target.value as CreativeStatus | '')}><option value="">{t('review.all')}</option>{Object.values(CreativeStatus).map((value) => <option key={value} value={value}>{STATUS_LABELS[value]?.[lang] ?? value}</option>)}</select></FormField>
        <FormField label={t('review.searchLabel')} htmlFor="review-search"><input id="review-search" type="search" placeholder={t('review.searchPlaceholder')} value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></FormField>
        <p className="result-count">{t('review.resultCount', { count: creatives.length })}</p>
      </div>
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
