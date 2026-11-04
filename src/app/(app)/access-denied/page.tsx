import type { Metadata } from 'next';
import Forbidden from '@/app/forbidden';

export const metadata: Metadata = { title: 'Access denied' };

/** Rendered by the middleware (HTTP 403) for admin-only pages opened by a viewer (§17.6). */
export default function AccessDeniedPage() {
  return <Forbidden />;
}
