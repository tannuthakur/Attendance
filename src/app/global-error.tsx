'use client';

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui', display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <h1>Something went wrong</h1>
          <button onClick={reset}>Try again</button>
        </div>
      </body>
    </html>
  );
}
