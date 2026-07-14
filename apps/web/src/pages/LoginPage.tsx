import { useMutation } from '@apollo/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { graphql } from '../generated';

const LoginDocument = graphql(`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) { id email displayName role }
  }
`);

const schema = z.object({
  email: z.string().email('올바른 이메일을 입력하세요'),
  password: z.string().min(1, '비밀번호를 입력하세요'),
});
type FormValues = z.infer<typeof schema>;

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const navigate = useNavigate();
  const [login, { error }] = useMutation(LoginDocument);
  const { register, handleSubmit, formState } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    await login({ variables: values });
    onLogin();
    navigate('/brands');
  });

  return (
    <main>
      <h1>BabeLoop 로그인</h1>
      <form onSubmit={onSubmit}>
        <label>
          이메일
          <input type="email" {...register('email')} />
        </label>
        {formState.errors.email && <p role="alert">{formState.errors.email.message}</p>}
        <label>
          비밀번호
          <input type="password" {...register('password')} />
        </label>
        {formState.errors.password && <p role="alert">{formState.errors.password.message}</p>}
        {error && <p role="alert">로그인 실패: 이메일 또는 비밀번호를 확인하세요</p>}
        <button type="submit" disabled={formState.isSubmitting}>로그인</button>
      </form>
    </main>
  );
}
