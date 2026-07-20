import { useMutation } from '@apollo/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { graphql } from '../generated';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FormField } from '../components/FormField';

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
    <main className="login-page">
      <Card className="login-card">
      <div className="login-wordmark">BabeLoop</div>
      <h1>BabeLoop 로그인</h1>
      <p>BabeChat 마케팅 자동화 내부 도구</p>
      <form className="page-form" onSubmit={onSubmit}>
        <FormField label="이메일" htmlFor="login-email"><input id="login-email" type="email" {...register('email')} /></FormField>
        {formState.errors.email && <p role="alert">{formState.errors.email.message}</p>}
        <FormField label="비밀번호" htmlFor="login-password"><input id="login-password" type="password" {...register('password')} /></FormField>
        {formState.errors.password && <p role="alert">{formState.errors.password.message}</p>}
        {error && <p role="alert">로그인 실패: 이메일 또는 비밀번호를 확인하세요</p>}
        <Button variant="primary" type="submit" disabled={formState.isSubmitting}>로그인</Button>
      </form>
      </Card>
    </main>
  );
}
