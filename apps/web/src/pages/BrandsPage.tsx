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

const BrandsDocument = graphql(`
  query BrandList { brands { id name serviceUrl description features { id } guidelines { id } } }
`);

const CreateBrandDocument = graphql(`
  mutation CreateBrand($input: CreateBrandInput!) {
    createBrand(input: $input) { id name }
  }
`);

const schema = z.object({
  name: z.string().min(1, '브랜드명을 입력하세요'),
  serviceUrl: z.string().url('올바른 URL을 입력하세요').optional().or(z.literal('')),
  description: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export function BrandsPage() {
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
        title="브랜드"
        step="준비 — 브리프 재료"
        description="BabeChat 제품 소개와 기능 정보를 등록하는 곳입니다. 여기 등록된 내용이 브리프 생성 시 「우리 제품」 재료로 AI에게 전달됩니다."
        actions={<Button variant="primary" onClick={() => setShowCreate((value) => !value)}>새 브랜드 등록</Button>}
      />
      <HelpPanel page="brands" />

      <Modal title="새 브랜드 등록" open={showCreate} onClose={() => { setShowCreate(false); reset(); }}>
        <p className="muted">여기 적는 내용이 브리프 생성 시 「우리 제품」 재료로 AI에게 전달됩니다. 소개까지 채우면 문구 품질이 좋아집니다.</p>
        <form className="page-form" onSubmit={onSubmit}>
          <FormField label="브랜드명" htmlFor="brand-name"><input id="brand-name" {...register('name')} /></FormField>
          {formState.errors.name && <p role="alert">{formState.errors.name.message}</p>}
          <FormField label="서비스 URL" htmlFor="brand-url"><input id="brand-url" {...register('serviceUrl')} /></FormField>
          {formState.errors.serviceUrl && <p role="alert">{formState.errors.serviceUrl.message}</p>}
          <FormField label="소개" htmlFor="brand-description"><textarea id="brand-description" placeholder="제품이 무엇이고 누구를 위한 것인지 2~3문장으로" {...register('description')} /></FormField>
          <p className="form-hint">주요 기능·가이드라인은 등록 후 상세 페이지의 「수정」에서 추가합니다.</p>
          <Button variant="primary" type="submit" disabled={formState.isSubmitting}>브랜드 등록</Button>
        </form>
      </Modal>

      {data?.brands.length === 0 && !showCreate && (
        <Card className="card-stack"><p className="muted">아직 등록된 브랜드가 없습니다. 우측 상단 「새 브랜드 등록」으로 시작하세요.</p></Card>
      )}

      <ul className="card-list card-grid">
        {data?.brands.map((brand) => (
          <li key={brand.id}>
            <Link className="brand-list-card" to={`/brands/${brand.id}`}>
              <Card className="card-stack">
                <h2>{brand.name}</h2>
                {brand.serviceUrl && <span className="muted">{brand.serviceUrl}</span>}
                <span className="brand-counts">기능 {brand.features.length} · 가이드라인 {brand.guidelines.length}</span>
                <span className="brand-detail-cta">상세 보기 →</span>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
