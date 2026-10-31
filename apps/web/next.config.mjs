// The monorepo keeps one .env at its root; hosted builds set these variables directly.
try { process.loadEnvFile('../../.env'); } catch {}

const headers = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
];

export default { transpilePackages: ['@mamp/pricing'], headers: async () => [{ source: '/:path*', headers }] };
