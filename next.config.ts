import type { NextConfig } from 'next';

const securityHeaders = [
  // SAMEORIGIN (not DENY) so the invoice PDF can be previewed in an in-app dialog; other sites still can't frame us.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ['@react-pdf/renderer'],
  experimental: { serverActions: { bodySizeLimit: '4mb' }, authInterrupts: true },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
