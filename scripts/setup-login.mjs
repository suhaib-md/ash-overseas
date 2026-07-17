// Provision the single-user login. Writes the username + PBKDF2 password hash into
// the D1 `app_credentials` table (so they can later be changed from inside the app),
// and optionally sets the AUTH_SECRET cookie-signing key.
//
//   node scripts/setup-login.mjs            # target PRODUCTION D1 + secret
//   node scripts/setup-login.mjs --local    # target the LOCAL dev D1 (for testing)
//
// Prereq (prod, first time): `pnpm db:migrate:prod` so the table exists.
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const ITER = 100_000; // must match worker/auth.ts (Workers caps PBKDF2 at 100k)
const local = process.argv.includes('--local');
const target = local
  ? { db: 'ash-overseas-dev', flags: '--local' }
  : { db: 'ash-overseas-prod', flags: '--remote --env production' };
const cwd = process.cwd();

const rl = createInterface({ input: stdin, output: stdout });

let username = (await rl.question('Username: ')).trim();
while (!/^[A-Za-z0-9._-]{3,64}$/.test(username)) {
  username = (await rl.question('  → 3–64 chars, letters/digits/._- only. Try again: ')).trim();
}

let password = (await rl.question('Password (blank = generate a strong one): ')).trim();
let generated = false;
if (!password) {
  password = randomBytes(18).toString('base64url');
  generated = true;
} else {
  while (password.length < 8) {
    password = (await rl.question('  → min 8 characters. Try again: ')).trim();
  }
}

const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, ITER, 32, 'sha256');
const passwordHash = `pbkdf2$${ITER}$${salt.toString('base64')}$${hash.toString('base64')}`;
const userSql = username.replace(/'/g, "''"); // defensive; regex already forbids quotes

const run = (cmd, opts = {}) =>
  spawnSync(cmd, {
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: true,
    cwd,
    timeout: 60000,
    ...opts,
  });

// 1) Upsert the single credential row (id = 1).
const sql =
  `INSERT INTO app_credentials (id, username, password_hash, updated_at) ` +
  `VALUES (1, '${userSql}', '${passwordHash}', unixepoch()) ` +
  `ON CONFLICT(id) DO UPDATE SET username=excluded.username, ` +
  `password_hash=excluded.password_hash, updated_at=excluded.updated_at;`;
console.log(`\nWriting credentials to ${target.db} …`);
const r = run(`npx wrangler d1 execute ${target.db} ${target.flags} --command "${sql}"`);
if (r.status !== 0 && !r.signal) {
  console.error(`\nFailed to write credentials (exit ${r.status}).`);
  console.error(
    local ? '  Did you run `pnpm db:migrate:local`?' : '  Did you run `pnpm db:migrate:prod`?',
  );
  process.exit(r.status ?? 1);
}

// 2) AUTH_SECRET — signs session cookies. Local dev reads it from .dev.vars instead.
if (!local) {
  const ans = (
    await rl.question(
      '\nSet/rotate AUTH_SECRET now? (rotating logs out any active session) (y/N): ',
    )
  )
    .trim()
    .toLowerCase();
  if (ans === 'y' || ans === 'yes') {
    const secret = randomBytes(32).toString('base64');
    const s = run('npx wrangler secret put AUTH_SECRET --env production', { input: secret });
    if (s.status !== 0 && !s.signal) {
      console.error(`\nAUTH_SECRET failed (exit ${s.status}). Logged in? Try: npx wrangler login`);
    }
  }
}
rl.close();

console.log('\n✅ Login provisioned.');
console.log(`   Username: ${username}`);
if (generated) {
  console.log(
    `   Password: ${password}   ← SAVE THIS (not recoverable). You can change it in-app.`,
  );
}
if (local) {
  console.log('   Local: put AUTH_SECRET="anything" in .dev.vars to enable the gate in dev.');
} else {
  console.log('   Deploy the app if you have not yet: pnpm deploy:prod');
  console.log('   Then open the app → sign in. Change username/password anytime under Account.');
}
