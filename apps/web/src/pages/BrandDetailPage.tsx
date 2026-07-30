import { useMutation, useQuery } from '@apollo/client';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { graphql } from '../generated';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FormField } from '../components/FormField';
import { useT } from '../i18n/lang-context';
import { JobStatus } from '../generated/graphql';
import { useJobPolling } from '../hooks/useJobPolling';

const BrandDocument = graphql(`
  query Brand($id: ID!) {
    brand(id: $id) { id name serviceUrl description zhTwJson koJson zhTwTranslatedAt updatedAt features { id name description } guidelines { id title content } }
  }
`);

const UpdateBrandDocument = graphql(`mutation UpdateBrand($input: UpdateBrandInput!) { updateBrand(input: $input) { id name serviceUrl description } }`);
const AddBrandFeatureDocument = graphql(`mutation AddBrandFeature($brandId: ID!, $name: String!, $description: String!) { addBrandFeature(brandId: $brandId, name: $name, description: $description) { id } }`);
const DeleteBrandFeatureDocument = graphql(`mutation DeleteBrandFeature($id: ID!) { deleteBrandFeature(id: $id) }`);
const AddBrandGuidelineDocument = graphql(`mutation AddBrandGuideline($brandId: ID!, $title: String!, $content: String!) { addBrandGuideline(brandId: $brandId, title: $title, content: $content) { id } }`);
const DeleteBrandGuidelineDocument = graphql(`mutation DeleteBrandGuideline($id: ID!) { deleteBrandGuideline(id: $id) }`);
const TranslateBrandZhTwDocument = graphql(`mutation TranslateBrandZhTw($brandId: ID!) { translateBrandZhTw(brandId: $brandId) { id status } }`);

export function BrandDetailPage() {
  const { lang, t } = useT();
  const { id } = useParams<{ id: string }>();
  const { data, refetch } = useQuery(BrandDocument, { variables: { id: id! }, skip: !id });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [serviceUrl, setServiceUrl] = useState('');
  const [description, setDescription] = useState('');
  const [featureName, setFeatureName] = useState('');
  const [featureDescription, setFeatureDescription] = useState('');
  const [guidelineTitle, setGuidelineTitle] = useState('');
  const [guidelineContent, setGuidelineContent] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updateBrand] = useMutation(UpdateBrandDocument);
  const [addFeature] = useMutation(AddBrandFeatureDocument);
  const [deleteFeature] = useMutation(DeleteBrandFeatureDocument);
  const [addGuideline] = useMutation(AddBrandGuidelineDocument);
  const [deleteGuideline] = useMutation(DeleteBrandGuidelineDocument);
  const [translateBrand] = useMutation(TranslateBrandZhTwDocument);
  const job = useJobPolling(jobId);

  useEffect(() => {
    if (job?.status === JobStatus.Failed) { setError(job.error ?? t('brands.translationFailed')); setJobId(null); return; }
    if (job?.status !== JobStatus.Succeeded) return;
    void refetch();
    setJobId(null);
  }, [job?.error, job?.status, refetch, t]);

  const brand = data?.brand;
  if (!brand) return <section><p className="muted">{t('brands.loading')}</p></section>;

  function startEdit() {
    setName(brand!.name);
    setServiceUrl(brand!.serviceUrl ?? '');
    setDescription(brand!.description ?? '');
    setEditing(true);
  }

  async function saveBasics() {
    await updateBrand({ variables: { input: { id: brand!.id, name, serviceUrl: serviceUrl || null, description } } });
    await refetch();
    setEditing(false);
  }

  async function translate() {
    setError(null);
    try {
      const result = await translateBrand({ variables: { brandId: brand!.id } });
      setJobId(result.data!.translateBrandZhTw.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

  type BrandRendition = { description: string; features: Array<{ name: string; description: string }>; guidelines: Array<{ title: string; content: string }> };
  const zhTw = brand.zhTwJson ? JSON.parse(brand.zhTwJson) as BrandRendition : null;
  const koRendition = brand.koJson ? JSON.parse(brand.koJson) as BrandRendition : null;
  // 원문이 어느 언어로 작성되었든, 번역 생성이 채운 언어별 정리본이 있으면 그것을 우선 표시하고 없으면 원문을 보여준다
  const rendition = lang === 'zhTw' ? zhTw : koRendition;
  const shownDescription = rendition ? rendition.description : brand.description;
  const shownFeatures = rendition ? rendition.features : brand.features;
  const shownGuidelines = rendition ? rendition.guidelines : brand.guidelines;
  const translationStale = Boolean(brand.zhTwTranslatedAt && new Date(brand.updatedAt).getTime() > new Date(brand.zhTwTranslatedAt).getTime());

  return (
    <section className="stage-prep brand-detail">
      <Link className="back-link" to="/brands">{t('brands.back')}</Link>

      <header className="page-header">
        <div>
          <div className="page-header-title-row">
            <h1>{brand.name}</h1>
            <span className="step-chip">{t('brands.material')}</span>
          </div>
          {brand.serviceUrl && <p><a href={brand.serviceUrl} target="_blank" rel="noreferrer">{brand.serviceUrl}</a></p>}
        </div>
        <div className="page-header-actions">
          <Button data-hint={t('brands.translateHint')} disabled={Boolean(jobId)} onClick={() => void translate()}>{t('brands.translate')}</Button>
          {!editing && <Button variant="primary" onClick={startEdit}>{t('brands.edit')}</Button>}
          {editing && (
            <div className="inline-actions">
              <Button variant="primary" onClick={() => void saveBasics()}>{t('common.save')}</Button>
              <Button onClick={() => setEditing(false)}>{t('common.cancel')}</Button>
            </div>
          )}
        </div>
      </header>

      {error && <p className="error" role="alert">{error}</p>}
      {job && job.status !== JobStatus.Succeeded && job.status !== JobStatus.Failed && <p>{t('brands.translating', { status: job.status })}</p>}
      {translationStale && <p className="notice">{t('brands.staleTranslation')}</p>}
      {!editing && lang === 'zhTw' && !zhTw && <p className="notice">{t('brands.noTranslation')}</p>}

      {!editing ? (
        <>
          <Card className="card-stack">
            <h2>{t('brands.introduction')}</h2>
            <p className="brand-description">{shownDescription || <span className="muted">{t('brands.noIntroduction')}</span>}</p>
          </Card>
          <Card className="card-stack">
            <h2>{t('brands.featuresCount', { count: shownFeatures.length })}</h2>
            {shownFeatures.length === 0 && <p className="muted">{t('brands.noFeatures')}</p>}
            <dl className="brand-dl">
              {shownFeatures.map((feature, index) => (
                <div key={`${feature.name}-${index}`}><dt>{feature.name}</dt><dd>{feature.description}</dd></div>
              ))}
            </dl>
          </Card>
          <Card className="card-stack">
            <h2>{t('brands.guidelinesCount', { count: shownGuidelines.length })}</h2>
            {shownGuidelines.length === 0 && <p className="muted">{t('brands.noGuidelines')}</p>}
            <dl className="brand-dl">
              {shownGuidelines.map((guideline, index) => (
                <div key={`${guideline.title}-${index}`}><dt>{guideline.title}</dt><dd>{guideline.content}</dd></div>
              ))}
            </dl>
          </Card>
        </>
      ) : (
        <>
          <Card className="card-stack">
            <h2>{t('brands.basics')}</h2>
            <FormField label={t('brands.name')} htmlFor="edit-brand-name"><input id="edit-brand-name" value={name} onChange={(event) => setName(event.target.value)} /></FormField>
            <FormField label={t('brands.serviceUrl')} htmlFor="edit-brand-url"><input id="edit-brand-url" type="url" value={serviceUrl} onChange={(event) => setServiceUrl(event.target.value)} /></FormField>
            <FormField label={t('brands.introduction')} htmlFor="edit-brand-description"><textarea id="edit-brand-description" value={description} onChange={(event) => setDescription(event.target.value)} /></FormField>
          </Card>
          <Card className="card-stack">
            <h2>{t('brands.features')}</h2>
            <ul className="compact-list">
              {brand.features.map((feature) => (
                <li key={feature.id}>
                  <span><strong>{feature.name}</strong> — {feature.description}</span>
                  <Button size="sm" onClick={() => void deleteFeature({ variables: { id: feature.id } }).then(() => refetch())}>{t('common.delete')}</Button>
                </li>
              ))}
            </ul>
            <FormField label={t('brands.featureName')} htmlFor="new-feature-name"><input id="new-feature-name" value={featureName} onChange={(event) => setFeatureName(event.target.value)} /></FormField>
            <FormField label={t('brands.featureDescription')} htmlFor="new-feature-description"><input id="new-feature-description" value={featureDescription} onChange={(event) => setFeatureDescription(event.target.value)} /></FormField>
            <Button size="sm" disabled={!featureName || !featureDescription} onClick={() => void addFeature({ variables: { brandId: brand.id, name: featureName, description: featureDescription } }).then(() => { setFeatureName(''); setFeatureDescription(''); return refetch(); })}>{t('brands.addFeature')}</Button>
          </Card>
          <Card className="card-stack">
            <h2>{t('brands.guidelines')}</h2>
            <ul className="compact-list">
              {brand.guidelines.map((guideline) => (
                <li key={guideline.id}>
                  <span><strong>{guideline.title}</strong> — {guideline.content}</span>
                  <Button size="sm" onClick={() => void deleteGuideline({ variables: { id: guideline.id } }).then(() => refetch())}>{t('common.delete')}</Button>
                </li>
              ))}
            </ul>
            <FormField label={t('brands.guidelineTitle')} htmlFor="new-guideline-title"><input id="new-guideline-title" value={guidelineTitle} onChange={(event) => setGuidelineTitle(event.target.value)} /></FormField>
            <FormField label={t('brands.guidelineContent')} htmlFor="new-guideline-content"><textarea id="new-guideline-content" value={guidelineContent} onChange={(event) => setGuidelineContent(event.target.value)} /></FormField>
            <Button size="sm" disabled={!guidelineTitle || !guidelineContent} onClick={() => void addGuideline({ variables: { brandId: brand.id, title: guidelineTitle, content: guidelineContent } }).then(() => { setGuidelineTitle(''); setGuidelineContent(''); return refetch(); })}>{t('brands.addGuideline')}</Button>
          </Card>
        </>
      )}
    </section>
  );
}
