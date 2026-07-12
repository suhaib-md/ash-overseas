// Generate the two production secrets for single-user login:
//   AUTH_PASSWORD_HASH  — a PBKDF2 hash of your password (the plaintext is never stored)
//   AUTH_SECRET         — a random key used to sign session cookies
//
// Usage:  node scripts/hash-password.mjs [password]
// (leave the password blank to have a strong one generated for you)
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const ITERATIONS = 210_000; // must match worker/auth.ts

let password = process.argv[2];
if (!password) {
  const rl = createInterface({ input: stdin, output: stdout });
  password = (await rl.question('Owner password (blank = generate a strong one): ')).trim();
  rl.close();
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
console.log('Set them and redeploy:');
console.log('  npx wrangler secret put AUTH_PASSWORD_HASH --env production');
console.log('  npx wrangler secret put AUTH_SECRET --env production');
console.log('  npx wrangler deploy --env production\n');
console.log('(To test login locally, put the same two lines in .dev.vars instead.)');
