// Generate (and optionally install) the two production secrets for single-user login:
//   AUTH_PASSWORD_HASH  — a PBKDF2 hash of your password (the plaintext is never stored)
//   AUTH_SECRET         — a random key used to sign session cookies
//
// Usage:  node scripts/hash-password.mjs [password]
// (leave the password blank to have a strong one generated for you)
//
// It offers to push both to Cloudflare production directly (piping each value to
// `wrangler secret put` over stdin), so you never hand-paste them — a mangled/
// truncated paste is exactly what makes the login route 500.
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const ITERATIONS = 100_000; // must match worker/auth.ts (Workers caps PBKDF2 at 100k)

const rl = createInterface({ input: stdin, output: stdout });

let password = process.argv[2];
if (!password) {
  password = (await rl.question('Owner password (blank = generate a strong one): ')).trim();
}

let generated = false;
if (!password) {
  password = randomBytes(18).toString('base64url'); // ~24 strong chars
  generated = true;
}

const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256');
const AUTH_PASSWORD_HASH = `pbkdf2$${ITERATIONS}$${salt.toString('base64')}$${hash.toString('base64')}`;
const AUTH_SECRET = randomBytes(32).toString('base64');

console.log('\n=== Production secrets ===\n');
console.log('AUTH_PASSWORD_HASH:\n' + AUTH_PASSWORD_HASH + '\n');
console.log('AUTH_SECRET:\n' + AUTH_SECRET + '\n');
if (generated) {
  console.log('Generated password (SAVE THIS in a password manager — it is not recoverable):');
  console.log('  ' + password + '\n');
}

const answer = (await rl.question('Set these on Cloudflare production now with wrangler? (y/N): '))
  .trim()
  .toLowerCase();
rl.close();

if (answer === 'y' || answer === 'yes') {
  // Pipe each value to wrangler over stdin — no shell interpolation of `$`, no
  // copy-paste, no trailing newline. This is the corruption-proof path.
  const put = (name, value) => {
    console.log(`\nSetting ${name} …`);
    const r = spawnSync(`npx wrangler secret put ${name} --env production`, {
      input: value,
      stdio: ['pipe', 'inherit', 'inherit'],
      shell: true,
      // wrangler sometimes uploads the secret then fails to exit on Windows; the
      // "✨ Success!" line above tells the truth. Cap the wait so we never hang.
      timeout: 60000,
    });
    if (r.status === 0) return; // clean success
    if (r.signal || r.error?.code === 'ETIMEDOUT') {
      console.warn(`  (wrangler didn't exit cleanly — a known Windows quirk. If it printed`);
      console.warn(
        `   "✨ Success! Uploaded secret ${name}" above, it worked. Verify in the app.)`,
      );
      return;
    }
    console.error(`\n${name} failed (exit ${r.status}). Logged in? Try: npx wrangler login`);
    process.exit(r.status ?? 1);
  };
  put('AUTH_PASSWORD_HASH', AUTH_PASSWORD_HASH);
  put('AUTH_SECRET', AUTH_SECRET);
  console.log('\n✅ Both secrets set. They take effect immediately (no redeploy).');
  console.log(
    '   Verify: open the app in an incognito window → you should get the password screen.',
  );
} else {
  console.log('\nSkipped. Set them yourself (each re-versions the Worker; no redeploy needed):');
  console.log('  npx wrangler secret put AUTH_PASSWORD_HASH --env production');
  console.log('  npx wrangler secret put AUTH_SECRET --env production');
  console.log('To test login locally instead, put the same two lines in .dev.vars.');
}
