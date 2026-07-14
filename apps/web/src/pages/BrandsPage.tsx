import { useMutation, useQuery } from '@apollo/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { graphql } from '../generated';

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
    <main>
      <h1>브랜드</h1>
      <form onSubmit={onSubmit}>
        <label>
          브랜드명
          <input {...register('name')} />
        </label>
        {formState.errors.name && <p role="alert">{formState.errors.name.message}</p>}
        <label>
          서비스 URL
          <input {...register('serviceUrl')} />
        </label>
        <button type="submit" disabled={formState.isSubmitting}>브랜드 등록</button>
      </form>
      <ul>
        {data?.brands.map((b) => (
          <li key={b.id}>
            {b.name} {b.serviceUrl && <span>({b.serviceUrl})</span>}
          </li>
        ))}
      </ul>
    </main>
  );
}
