import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/features/auth/components/forgot-password-form';

export const metadata: Metadata = { title: 'Forgot password' };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Forgot password</h1>
      <p className="mb-6 text-sm text-muted-foreground">We will email you a link to reset it.</p>
      <ForgotPasswordForm />
    </>
  );
}
