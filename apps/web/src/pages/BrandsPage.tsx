import { useMutation, useQuery } from '@apollo/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { graphql } from '../generated';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FormField } from '../components/FormField';
import { PageHeader } from '../components/PageHeader';

const BrandsDocument = graphql(`
  query Brands { brands { id name serviceUrl features { id name } } }
`);

const CreateBrandDocument = graphql(`
  mutation CreateBrand($input: CreateBrandInput!) {
    createBrand(input: $input) { id name }
  }
`);

const schema = z.object({
  name: z.string().min(1, '브랜드명을 입력하세요'),
  serviceUrl: z.string().url('올바른 URL을 입력하세요').optional().or(z.literal('')),
});
type FormValues = z.infer<typeof schema>;

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
    <section>
      <PageHeader title="브랜드" step="준비 — 브리프 재료" description="BabeChat 제품 소개와 기능 정보를 등록하는 곳입니다. 여기 등록된 내용이 브리프 생성 시 「우리 제품」 재료로 AI에게 전달됩니다. 처음 한 번 등록하고 제품이 바뀔 때 갱신하세요." />
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
            <Card>
            {b.name} {b.serviceUrl && <span>({b.serviceUrl})</span>}
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
