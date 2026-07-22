import { useMutation, useQuery } from '@apollo/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import { graphql } from '../generated';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FormField } from '../components/FormField';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { HelpPanel } from '../components/HelpPanel';
import { useT } from '../i18n/lang-context';

const BrandsDocument = graphql(`
  query BrandList { brands { id name serviceUrl description features { id } guidelines { id } } }
`);

const CreateBrandDocument = graphql(`
  mutation CreateBrand($input: CreateBrandInput!) {
    createBrand(input: $input) { id name }
  }
`);

type FormValues = { name: string; serviceUrl?: string; description?: string };

export function BrandsPage() {
  const { t } = useT();
  const schema = z.object({ name: z.string().min(1, t('brands.requiredName')), serviceUrl: z.string().url(t('brands.invalidUrl')).optional().or(z.literal('')), description: z.string().optional() });
  const { data, refetch } = useQuery(BrandsDocument);
  const [createBrand] = useMutation(CreateBrandDocument);
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();
  const { register, handleSubmit, reset, formState } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    const result = await createBrand({
      variables: { input: { name: values.name, serviceUrl: values.serviceUrl || null, description: values.description || null, features: [] } },
    });
    reset();
    setShowCreate(false);
    await refetch();
    const id = result.data?.createBrand.id;
    if (id) navigate(`/brands/${id}`); // 등록 직후 상세로 이동해 기능·가이드라인을 이어서 채우게 한다
  });

  return (
    <section className="stage-prep">
      <PageHeader
        title={t('brands.title')}
        step={t('brands.step')}
        description={t('brands.description')}
        actions={<Button variant="primary" onClick={() => setShowCreate((value) => !value)}>{t('brands.newBrand')}</Button>}
      />
      <HelpPanel page="brands" />

      <Modal title={t('brands.newBrand')} open={showCreate} onClose={() => { setShowCreate(false); reset(); }}>
        <p className="muted">{t('brands.createHelp')}</p>
        <form className="page-form" onSubmit={onSubmit}>
          <FormField label={t('brands.name')} htmlFor="brand-name"><input id="brand-name" {...register('name')} /></FormField>
          {formState.errors.name && <p role="alert">{formState.errors.name.message}</p>}
          <FormField label={t('brands.serviceUrl')} htmlFor="brand-url"><input id="brand-url" {...register('serviceUrl')} /></FormField>
          {formState.errors.serviceUrl && <p role="alert">{formState.errors.serviceUrl.message}</p>}
          <FormField label={t('brands.introduction')} htmlFor="brand-description"><textarea id="brand-description" placeholder={t('brands.descriptionPlaceholder')} {...register('description')} /></FormField>
          <p className="form-hint">{t('brands.afterCreateHint')}</p>
          <Button variant="primary" type="submit" disabled={formState.isSubmitting}>{t('brands.create')}</Button>
        </form>
      </Modal>

      {data?.brands.length === 0 && !showCreate && (
        <Card className="card-stack"><p className="muted">{t('brands.empty')}</p></Card>
      )}

      <ul className="card-list card-grid">
        {data?.brands.map((brand) => (
          <li key={brand.id}>
            <Link className="brand-list-card" to={`/brands/${brand.id}`}>
              <Card className="card-stack">
                <h2>{brand.name}</h2>
                {brand.serviceUrl && <span className="muted">{brand.serviceUrl}</span>}
                <span className="brand-counts">{t('brands.counts', { features: brand.features.length, guidelines: brand.guidelines.length })}</span>
                <span className="brand-detail-cta">{t('brands.detail')}</span>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
