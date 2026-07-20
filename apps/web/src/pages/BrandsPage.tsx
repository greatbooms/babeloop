import { useMutation, useQuery } from '@apollo/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { z } from 'zod';
import { graphql } from '../generated';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FormField } from '../components/FormField';
import { PageHeader } from '../components/PageHeader';
import { HelpPanel } from '../components/HelpPanel';
import type { BrandsQuery } from '../generated/graphql';

const BrandsDocument = graphql(`
  query Brands { brands { id name serviceUrl description features { id name description } guidelines { id title content } } }
`);

const CreateBrandDocument = graphql(`
  mutation CreateBrand($input: CreateBrandInput!) {
    createBrand(input: $input) { id name }
  }
`);

const UpdateBrandDocument = graphql(`mutation UpdateBrand($input: UpdateBrandInput!) { updateBrand(input: $input) { id description } }`);
const AddBrandFeatureDocument = graphql(`mutation AddBrandFeature($brandId: ID!, $name: String!, $description: String!) { addBrandFeature(brandId: $brandId, name: $name, description: $description) { id } }`);
const DeleteBrandFeatureDocument = graphql(`mutation DeleteBrandFeature($id: ID!) { deleteBrandFeature(id: $id) }`);
const AddBrandGuidelineDocument = graphql(`mutation AddBrandGuideline($brandId: ID!, $title: String!, $content: String!) { addBrandGuideline(brandId: $brandId, title: $title, content: $content) { id } }`);
const DeleteBrandGuidelineDocument = graphql(`mutation DeleteBrandGuideline($id: ID!) { deleteBrandGuideline(id: $id) }`);

const schema = z.object({
  name: z.string().min(1, '브랜드명을 입력하세요'),
  serviceUrl: z.string().url('올바른 URL을 입력하세요').optional().or(z.literal('')),
});
type FormValues = z.infer<typeof schema>;

type Brand = BrandsQuery['brands'][number];

function BrandEditor({ brand, refetch }: { brand: Brand; refetch: () => Promise<unknown> }) {
  const [description, setDescription] = useState(brand.description ?? '');
  const [featureName, setFeatureName] = useState('');
  const [featureDescription, setFeatureDescription] = useState('');
  const [guidelineTitle, setGuidelineTitle] = useState('');
  const [guidelineContent, setGuidelineContent] = useState('');
  const [updateBrand] = useMutation(UpdateBrandDocument);
  const [addFeature] = useMutation(AddBrandFeatureDocument);
  const [deleteFeature] = useMutation(DeleteBrandFeatureDocument);
  const [addGuideline] = useMutation(AddBrandGuidelineDocument);
  const [deleteGuideline] = useMutation(DeleteBrandGuidelineDocument);

  return (
    <Card className="card-stack brand-editor">
      <h2>{brand.name}</h2>
      {brand.serviceUrl && <a href={brand.serviceUrl}>{brand.serviceUrl}</a>}
      <FormField label="소개" htmlFor={`brand-description-${brand.id}`}><textarea id={`brand-description-${brand.id}`} value={description} onChange={(event) => setDescription(event.target.value)} /></FormField>
      <Button size="sm" onClick={() => void updateBrand({ variables: { input: { id: brand.id, description } } }).then(() => refetch())}>소개 저장</Button>
      <section className="brand-subsection"><h3>주요 기능</h3>
        <ul className="compact-list">{brand.features.map((feature) => <li key={feature.id}><span><strong>{feature.name}</strong> — {feature.description}</span><Button size="sm" onClick={() => void deleteFeature({ variables: { id: feature.id } }).then(() => refetch())}>삭제</Button></li>)}</ul>
        <FormField label="기능 이름" htmlFor={`feature-name-${brand.id}`}><input id={`feature-name-${brand.id}`} value={featureName} onChange={(event) => setFeatureName(event.target.value)} /></FormField>
        <FormField label="기능 설명" htmlFor={`feature-description-${brand.id}`}><input id={`feature-description-${brand.id}`} value={featureDescription} onChange={(event) => setFeatureDescription(event.target.value)} /></FormField>
        <Button size="sm" disabled={!featureName || !featureDescription} onClick={() => void addFeature({ variables: { brandId: brand.id, name: featureName, description: featureDescription } }).then(() => { setFeatureName(''); setFeatureDescription(''); return refetch(); })}>기능 추가</Button>
      </section>
      <section className="brand-subsection"><h3>가이드라인</h3>
        <ul className="compact-list">{brand.guidelines.map((guideline) => <li key={guideline.id}><span><strong>{guideline.title}</strong> — {guideline.content}</span><Button size="sm" onClick={() => void deleteGuideline({ variables: { id: guideline.id } }).then(() => refetch())}>삭제</Button></li>)}</ul>
        <FormField label="가이드라인 제목" htmlFor={`guideline-title-${brand.id}`}><input id={`guideline-title-${brand.id}`} value={guidelineTitle} onChange={(event) => setGuidelineTitle(event.target.value)} /></FormField>
        <FormField label="가이드라인 내용" htmlFor={`guideline-content-${brand.id}`}><textarea id={`guideline-content-${brand.id}`} value={guidelineContent} onChange={(event) => setGuidelineContent(event.target.value)} /></FormField>
        <Button size="sm" disabled={!guidelineTitle || !guidelineContent} onClick={() => void addGuideline({ variables: { brandId: brand.id, title: guidelineTitle, content: guidelineContent } }).then(() => { setGuidelineTitle(''); setGuidelineContent(''); return refetch(); })}>가이드라인 추가</Button>
      </section>
    </Card>
  );
}

export function BrandsPage() {
  const { data, refetch } = useQuery(BrandsDocument);
  const [createBrand] = useMutation(CreateBrandDocument);
  const { register, handleSubmit, reset, formState } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    await createBrand({
      variables: { input: { name: values.name, serviceUrl: values.serviceUrl || null, features: [] } },
    });
    reset();
    await refetch();
  });

  return (
    <section className="stage-prep">
      <PageHeader title="브랜드" step="준비 — 브리프 재료" description="BabeChat 제품 소개와 기능 정보를 등록하는 곳입니다. 여기 등록된 내용이 브리프 생성 시 「우리 제품」 재료로 AI에게 전달됩니다. 처음 한 번 등록하고 제품이 바뀔 때 갱신하세요." />
      <HelpPanel page="brands" />
      <p className="data-flow-note">여기 내용은 → 브리프 생성 시 AI 프롬프트의 「우리 제품」 섹션으로 들어갑니다</p>
      <Card className="page-form-card">
      <form className="page-form" onSubmit={onSubmit}>
        <FormField label="브랜드명" htmlFor="brand-name"><input id="brand-name" {...register('name')} /></FormField>
        {formState.errors.name && <p role="alert">{formState.errors.name.message}</p>}
        <FormField label="서비스 URL" htmlFor="brand-url"><input id="brand-url" {...register('serviceUrl')} /></FormField>
        <Button variant="primary" type="submit" disabled={formState.isSubmitting}>브랜드 등록</Button>
      </form>
      </Card>
      <ul className="card-list card-grid">
        {data?.brands.map((b) => (
          <li key={b.id}>
            <BrandEditor brand={b} refetch={refetch} />
          </li>
        ))}
      </ul>
    </section>
  );
}
