'use client';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { PasswordForm } from './password-form';

export function ResetPasswordClient() {
  const router = useRouter();
  return (
    <PasswordForm
      submitLabel="Set new password"
      onDone={() => {
        toast.success('Password updated');
        router.replace('/dashboard');
        router.refresh();
      }}
    />
  );
}
