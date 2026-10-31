import nextEnv from '@next/env';

nextEnv.loadEnvConfig('../..', process.env.NODE_ENV !== 'production');

export default { transpilePackages: ['@mamp/pricing'] };
