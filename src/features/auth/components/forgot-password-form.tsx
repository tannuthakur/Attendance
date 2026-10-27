'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { forgotPasswordSchema, type ForgotPasswordInput } from '../schemas';
import { requestPasswordReset } from '../actions';

export const RESET_SENT_MESSAGE = 'If an account exists, a reset link was sent';

export function ForgotPasswordForm() {
  const [message, setMessage] = useState<{ kind: 'info' | 'error'; text: string }>();
  const [pending, startTransition] = useTransition();
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = (values: ForgotPasswordInput) =>
    startTransition(async () => {
      const res = await requestPasswordReset(values);
      setMessage(res.ok ? { kind: 'info', text: RESET_SENT_MESSAGE } : { kind: 'error', text: res.error.message });
    });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {message && (
          <p role="status" className={message.kind === 'error' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
            {message.text}
          </p>
        )}
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" autoFocus {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? 'Sending…' : 'Send reset link'}
        </Button>
        <p className="text-center text-sm">
          <Link href="/login" className="underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </p>
      </form>
    </Form>
  );
}
