import { useMutation, useQuery } from '@apollo/client';
import { FormEvent, useEffect, useState } from 'react';
import { graphql } from '../generated';
import { JobStatus } from '../generated/graphql';
import { useJobPolling } from '../hooks/useJobPolling';
import { Link, useNavigate } from 'react-router';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FormField } from '../components/FormField';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { HelpPanel, InfoTip } from '../components/HelpPanel';
import { formatDate } from '../i18n/format-date';
import { useT } from '../i18n/lang-context';
import './media.css';
import './briefs.css';

const CreativeBriefsDocument = graphql(`
  query CreativeBriefs($search: String, $brandId: ID) {
    creativeBriefs(search: $search, brandId: $brandId) {
      id title hookType callToAction createdAt
      creatives { id }
    }
  }
`);

const BriefBrandsDocument = graphql(`query BriefBrands { brands { id name } }`);

const GenerateCreativeBriefDocument = graphql(`
  mutation GenerateCreativeBrief($input: GenerateCreativeBriefInput!) {
    generateCreativeBrief(input: $input) { job { id status } }
  }
`);

export function BriefsPage() {
  const { lang, t } = useT();
  // 변형 잡 완료 후에도 현지화 잡이 뒤따라 도착하므로 폴링하되, 생성 잡이 돌 때만 3초·평상시 30초
  const [jobId, setJobId] = useState<string | null>(null);
  const [filterBrandId, setFilterBrandId] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const { data, refetch } = useQuery(CreativeBriefsDocument, { variables: { search: search || undefined, brandId: filterBrandId || undefined }, pollInterval: jobId ? 3000 : 30_000 });
  const { data: brandsData } = useQuery(BriefBrandsDocument);
  const [generateBrief] = useMutation(GenerateCreativeBriefDocument);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [focusText, setFocusText] = useState('');
  const [brandId, setBrandId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const job = useJobPolling(jobId);
  const navigate = useNavigate();
  useEffect(() => { const timer = window.setTimeout(() => setSearch(searchInput), 300); return () => window.clearTimeout(timer); }, [searchInput]);

  // 생성이 끝나면 새 브리프 상세로 자동 이동한다 (광고 상세의 브리프 생성과 동일한 흐름)
  useEffect(() => {
    if (job?.status === JobStatus.Failed) {
      setError(job.error ?? t('briefs.failed'));
      setJobId(null);
      return;
    }
    if (job?.status !== JobStatus.Succeeded) return;
    const briefId = job.resultJson ? (JSON.parse(job.resultJson) as { briefId?: string }).briefId : undefined;
    void refetch();
    setJobId(null);
    if (briefId) navigate(`/briefs/${briefId}`);
  }, [job?.error, job?.status, job?.resultJson, navigate, refetch, t]);

  async function onGenerateBrief(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const result = await generateBrief({
        variables: { input: { title: title || undefined, focusText, brandId: brandId || undefined } },
      });
      setJobId(result.data!.generateCreativeBrief.job.id);
      setTitle('');
      setFocusText('');
      setCreateOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  const working = Boolean(jobId);
  const briefs = data?.creativeBriefs ?? [];

  return (
    <section className="stage-create">
      <PageHeader
        title={t('briefs.title')}
        step={t('briefs.step')}
        description={t('briefs.description')}
        actions={<Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>{t('briefs.newBrief')}</Button>}
      />
      <HelpPanel page="briefs" />
      <Modal title={t('briefs.newBrief')} open={createOpen} onClose={() => setCreateOpen(false)}>
        <p className="muted">{t('briefs.createDescription')}</p>
        <form className="page-form" onSubmit={onGenerateBrief}>
          <FormField label={t('briefs.titleLabel')} htmlFor="brief-title"><input id="brief-title" value={title} onChange={(event) => setTitle(event.target.value)} /></FormField>
          <FormField label={t('briefs.brand')} htmlFor="brief-brand"><select id="brief-brand" value={brandId} onChange={(event) => setBrandId(event.target.value)}><option value="">{t('briefs.noSelection')}</option>{brandsData?.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></FormField>
          <FormField label={<>{t('briefs.focus')} <InfoTip hint={t('briefs.focusHint')} /></>} htmlFor="brief-focus"><textarea id="brief-focus"
              required
              value={focusText}
              onChange={(event) => setFocusText(event.target.value)}
            /></FormField>
          <Button data-hint={t('briefs.createHint')} variant="primary" type="submit" disabled={working}>{t('briefs.create')}</Button>
        </form>
      </Modal>

      <div className="filter-bar media-filter-bar">
        <FormField label={t('briefs.brand')} htmlFor="brief-filter-brand"><select id="brief-filter-brand" value={filterBrandId} onChange={(event) => setFilterBrandId(event.target.value)}><option value="">{t('briefs.all')}</option>{brandsData?.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></FormField>
        <FormField label={t('briefs.searchLabel')} htmlFor="brief-search"><input id="brief-search" type="search" placeholder={t('briefs.searchPlaceholder')} value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></FormField>
        <p className="result-count">{t('briefs.resultCount', { count: briefs.length })}</p>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {job && job.status !== JobStatus.Succeeded && job.status !== JobStatus.Failed && (
        <p>{t('briefs.generating', { status: job.status })}</p>
      )}

      {briefs.length === 0 ? (
        <Card className="empty-state">
          <p>{t('briefs.empty')}</p>
        </Card>
      ) : (
        <ul className="briefs-grid">
          {briefs.map((brief) => (
            <li key={brief.id}>
              <Card className="brief-card">
                <h2><Link to={`/briefs/${brief.id}`}>{brief.title}</Link></h2>
                <div className="tag-row"><span className="tag tag-accent">{brief.hookType}</span></div>
                <p className="brief-cta-line">CTA: {brief.callToAction}</p>
                <p className="brief-meta">{t('briefs.variantsMeta', { count: brief.creatives.length, date: formatDate(String(brief.createdAt), lang) })}</p>
                <Link className="brand-detail-cta" to={`/briefs/${brief.id}`}>{t('common.detail')}</Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
