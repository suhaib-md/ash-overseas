// Build for the PRODUCTION Cloudflare environment, then deploy.
//
// Why a script instead of `wrangler deploy --env production`:
// the @cloudflare/vite-plugin picks the target environment at BUILD time from
// the CLOUDFLARE_ENV variable and bakes it into dist/<worker>/wrangler.json.
// A plain `vite build` bakes in the DEV worker + DEV D1, and a later
// `wrangler deploy --env production` does NOT override it — you'd ship to the
// dev database. Setting CLOUDFLARE_ENV before the build is the only correct way.
import { execSync } from 'node:child_process';

const env = { ...process.env, CLOUDFLARE_ENV: 'production' };
const run = (cmd) => execSync(cmd, { stdio: 'inherit', env });

run('vite build'); // generates dist/ with the PRODUCTION name + D1 baked in
run('wrangler deploy'); // uploads that build (no --env flag needed; env is in the build)
