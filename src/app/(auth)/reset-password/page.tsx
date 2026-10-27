import type { Metadata } from 'next';
import { ResetPasswordClient } from '@/features/auth/components/reset-password-client';

export const metadata: Metadata = { title: 'Reset password' };

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Choose a new password</h1>
      <p className="mb-6 text-sm text-muted-foreground">You will be signed in afterwards.</p>
      <ResetPasswordClient />
    </>
  );
}
