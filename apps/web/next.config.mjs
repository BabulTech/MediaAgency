// The monorepo keeps one .env at its root; hosted builds set these variables directly.
try { process.loadEnvFile('../../.env'); } catch {}

export default { transpilePackages: ['@mamp/pricing'] };
