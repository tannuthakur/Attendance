import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers/providers';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Employee Tracking & Invoicing', template: '%s · Invoicing' },
  description: 'Employees, projects, attendance and client invoices',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-svh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
