import { useMutation } from '@apollo/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { graphql } from '../generated';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FormField } from '../components/FormField';
import { useT } from '../i18n/lang-context';

const LoginDocument = graphql(`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) { id email displayName role }
  }
`);

type FormValues = { email: string; password: string };

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const { t } = useT();
  const schema = z.object({ email: z.string().email(t('login.invalidEmail')), password: z.string().min(1, t('login.requiredPassword')) });
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
      <h1>{t('login.title')}</h1>
      <p>{t('login.description')}</p>
      <form className="page-form" onSubmit={onSubmit}>
        <FormField label={t('login.email')} htmlFor="login-email"><input id="login-email" type="email" {...register('email')} /></FormField>
        {formState.errors.email && <p role="alert">{formState.errors.email.message}</p>}
        <FormField label={t('login.password')} htmlFor="login-password"><input id="login-password" type="password" {...register('password')} /></FormField>
        {formState.errors.password && <p role="alert">{formState.errors.password.message}</p>}
        {error && <p role="alert">{t('login.failed')}</p>}
        <Button variant="primary" type="submit" disabled={formState.isSubmitting}>{t('login.submit')}</Button>
      </form>
      </Card>
    </main>
  );
}
