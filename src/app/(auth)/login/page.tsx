import type { Metadata } from 'next';
import { LoginForm } from '@/features/auth/components/login-form';

export const metadata: Metadata = { title: 'Sign in' };

const ERRORS: Record<string, string> = {
  link_expired: 'That link is invalid or has expired. Please request a new one.',
  disabled: 'Your account is disabled',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { next, error } = await searchParams;
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Sign in</h1>
      <p className="mb-6 text-sm text-muted-foreground">Employee tracking &amp; invoicing</p>
      <LoginForm next={next} initialError={error ? ERRORS[error] : undefined} />
    </>
  );
}
