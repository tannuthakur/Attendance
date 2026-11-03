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

const PDF_RUNTIME_FILES = [
  './node_modules/.pnpm/pdfkit@*/node_modules/pdfkit/package.json',
  './node_modules/.pnpm/pdfkit@*/node_modules/pdfkit/js/standard-fonts/**/*',
  './node_modules/.pnpm/pdfkit@*/node_modules/pdfkit/js/data/**/*',
  // PNG export (src/lib/pdf/raster.ts): pdfjs loads its worker and standard fonts at runtime, which the
  // tracer can't see. (@napi-rs/canvas's native binary IS traced automatically; globbing pnpm's
  // @napi-rs folders pulls in symlinked dirs, which Vercel rejects as an invalid function package.)
  './node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/package.json',
  './node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/legacy/build/**/*',
  './node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/standard_fonts/**/*',
];

const nextConfig: NextConfig = {
  serverExternalPackages: ['@react-pdf/renderer', 'pdfjs-dist', '@napi-rs/canvas'],
  // pdfkit (used by @react-pdf) loads its built-in fonts via package "imports" (`#standard-fonts/Helvetica`)
  // at runtime, which the file tracer can't follow — without this, PDF rendering fails on Vercel with
  // "Cannot find module …/pdfkit/js/standard-fonts/Helvetica.cjs". PDFs are rendered only under /invoices.
  outputFileTracingIncludes: {
    '/invoices': PDF_RUNTIME_FILES,
    '/invoices/**/*': PDF_RUNTIME_FILES,
  },
  experimental: { serverActions: { bodySizeLimit: '4mb' }, authInterrupts: true },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
