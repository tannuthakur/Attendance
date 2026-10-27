import { describe, expect, it } from 'vitest';
import { actAs, anonClient, serviceClient, setActiveClient } from './helpers';
import { requestPasswordReset, signIn } from '@/features/auth/actions';

const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

describe('auth (local Supabase)', () => {
  it('admin and viewer can sign in', async () => {
    const admin = await actAs('admin');
    const viewer = await actAs('viewer');
    for (const email of [admin.email, viewer.email]) {
      setActiveClient(anonClient());
      const res = await signIn({ email, password: 'Test@12345', next: '/invoices' });
      expect(res).toEqual({ ok: true, data: { redirectTo: '/invoices' } });
    }
  });

  it('rejects bad passwords with a generic message', async () => {
    const { email } = await actAs('viewer');
    setActiveClient(anonClient());
    const res = await signIn({ email, password: 'wrong-pass-1' });
    expect(res).toEqual({ ok: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
    const unknown = await signIn({ email: 'nobody-here@test.local', password: 'wrong-pass-1' });
    expect(unknown.ok ? '' : unknown.error.message).toBe('Invalid email or password');
  });

  it('blocks inactive users', async () => {
    const { email } = await actAs('viewer', { email: 'it-inactive@test.local', active: false });
    setActiveClient(anonClient());
    const res = await signIn({ email, password: 'Test@12345' });
    expect(res).toEqual({ ok: false, error: { code: 'ACCOUNT_DISABLED', message: 'Your account is disabled' } });
  });

  it('records last login', async () => {
    const { email, userId } = await actAs('viewer');
    setActiveClient(anonClient());
    await signIn({ email, password: 'Test@12345' });
    const { data } = await serviceClient().from('profiles').select('last_login_at').eq('id', userId).single();
    expect(new Date(data!.last_login_at!).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it('sends a password reset email (Mailpit) without revealing account existence', async () => {
    const { email } = await actAs('viewer', { email: 'it-reset@test.local' });
    setActiveClient(anonClient());
    expect(await requestPasswordReset({ email })).toEqual({ ok: true, data: null });
    expect(await requestPasswordReset({ email: 'ghost@test.local' })).toEqual({ ok: true, data: null });

    let found = false;
    for (let i = 0; i < 20 && !found; i++) {
      const res = await fetch(`${MAILPIT}/api/v1/search?query=to:${encodeURIComponent(email)}`);
      found = res.ok && ((await res.json()) as { messages?: unknown[] }).messages!.length > 0;
      if (!found) await new Promise((r) => setTimeout(r, 500));
    }
    expect(found).toBe(true);
  });
});
