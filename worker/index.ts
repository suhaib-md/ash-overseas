/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { ZodType } from 'zod';
import { getDb } from './db/client';
import {
  dealerCreateSchema,
  dealerUpdateSchema,
  listQuerySchema,
  loginSchema,
  changePasswordSchema,
  changeUsernameSchema,
  transactionCreateSchema,
  movementCreateSchema,
} from '../shared/schemas';
import { describeBalance, type Account } from '../shared/ledger';
import { auditLog } from './db/schema';
import { createDealer, getDealer, updateDealer, archiveDealer, listDealers } from './repo/dealers';
import { getBalance, getDealerBalances, getLedger } from './repo/ledger';
import { getTransactionDetail, getSuggestions } from './repo/transactions';
import { getAuditLog } from './repo/audit';
import { getCredentials, updateUsername, updatePasswordHash } from './repo/credentials';
import { postTransaction, postMovement, voidSource } from './ledger/post';
import { hashPassword, verifyPassword, createSession, verifySession } from './auth';

export interface Env {
  DB: D1Database;
  // Set in production (wrangler secret) → enables login + signs session cookies.
  // Unset = local dev (open, no login). The username/password live in D1 (app_credentials).
  AUTH_SECRET?: string;
}

const SESSION_COOKIE = 'ash_session';
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const authRequired = (env: Env) => Boolean(env.AUTH_SECRET);
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Auth endpoints reachable WITHOUT a session. Everything else under /api/ (including
// /api/auth/change-*) requires a valid session cookie.
const PUBLIC_AUTH_PATHS = new Set(['/api/auth/login', '/api/auth/me', '/api/auth/logout']);

class HttpError extends Error {
  constructor(
    public status: 400 | 403 | 404,
    public payload: unknown,
  ) {
    super('http');
  }
}

function parse<T>(schema: ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    throw new HttpError(400, {
      error: 'validation',
      // field paths + messages only — never echo the submitted values (no PII/money in logs).
      issues: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return r.data;
}

async function jsonBody(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(400, { error: 'invalid_json' });
  }
}

function intParam(value: string | undefined, name: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, { error: `invalid_${name}` });
  return n;
}

const app = new Hono<{ Bindings: Env }>();

// Security headers on every worker response (Security Blueprint L2). The static SPA/HTML
// responses get their headers from public/_headers (served by the assets layer).
app.use(
  '*',
  secureHeaders({
    xFrameOptions: 'DENY',
    strictTransportSecurity: 'max-age=63072000; includeSubDomains; preload',
  }),
);

// Single-user session gate (Security Blueprint L1). Skipped when AUTH_* are unset (local
// dev, open). Auth endpoints are exempt so you can log in / check status. A missing or
// invalid session → 401, so no financial data is served without login.
app.use('/api/*', async (c, next) => {
  if (!authRequired(c.env)) return next();
  if (PUBLIC_AUTH_PATHS.has(c.req.path)) return next();
  const token = getCookie(c, SESSION_COOKIE);
  if (!token || !(await verifySession(token, c.env.AUTH_SECRET!))) {
    return c.json({ error: 'unauthenticated' }, 401);
  }
  return next();
});

// CSRF backstop: reject cross-site state-changing requests.
app.use('/api/*', async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    const site = c.req.header('sec-fetch-site');
    if (site && site !== 'same-origin' && site !== 'none') {
      return c.json({ error: 'cross_site_forbidden' }, 403);
    }
  }
  return next();
});

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json(err.payload, err.status);
  console.error('unhandled_error'); // static string only — no request body / PII
  return c.json({ error: 'internal' }, 500);
});

app.get('/api/health', (c) =>
  c.json({ ok: true, service: 'ash-overseas-ledger', time: new Date().toISOString() }),
);

// --- Auth (single-user password) -------------------------------------------

app.get('/api/auth/me', async (c) => {
  if (!authRequired(c.env)) return c.json({ authenticated: true, required: false });
  const token = getCookie(c, SESSION_COOKIE);
  const authenticated = token ? await verifySession(token, c.env.AUTH_SECRET!) : false;
  const username = authenticated ? (await getCredentials(getDb(c.env.DB)))?.username : undefined;
  return c.json({ authenticated, required: true, username });
});

app.post('/api/auth/login', async (c) => {
  if (!authRequired(c.env)) return c.json({ authenticated: true, required: false });
  const { username, password } = parse(loginSchema, await jsonBody(c));
  const cred = await getCredentials(getDb(c.env.DB));
  const ok =
    cred != null &&
    cred.username.toLowerCase() === username.trim().toLowerCase() &&
    (await verifyPassword(password, cred.passwordHash));
  if (!ok) {
    await delay(500); // slow down brute-force guessing
    return c.json({ error: 'invalid_credentials' }, 401);
  }
  const token = await createSession(c.env.AUTH_SECRET!, SESSION_TTL_SECONDS);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return c.json({ authenticated: true, username: cred.username });
});

app.post('/api/auth/logout', (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

// Change credentials (session required — enforced by the gate above — AND re-entry of
// the current password). Never stores the password, only its PBKDF2 hash.
app.post('/api/auth/change-password', async (c) => {
  const { currentPassword, newPassword } = parse(changePasswordSchema, await jsonBody(c));
  const db = getDb(c.env.DB);
  const cred = await getCredentials(db);
  if (!cred || !(await verifyPassword(currentPassword, cred.passwordHash))) {
    await delay(500);
    return c.json({ error: 'invalid_current_password' }, 401);
  }
  await updatePasswordHash(db, await hashPassword(newPassword));
  await db.insert(auditLog).values({ action: 'change-password', entity: 'auth', entityId: 1 });
  return c.json({ ok: true });
});

app.post('/api/auth/change-username', async (c) => {
  const { currentPassword, newUsername } = parse(changeUsernameSchema, await jsonBody(c));
  const db = getDb(c.env.DB);
  const cred = await getCredentials(db);
  if (!cred || !(await verifyPassword(currentPassword, cred.passwordHash))) {
    await delay(500);
    return c.json({ error: 'invalid_current_password' }, 401);
  }
  const next = newUsername.trim();
  await updateUsername(db, next);
  await db.insert(auditLog).values({
    action: 'change-username',
    entity: 'auth',
    entityId: 1,
    beforeJson: JSON.stringify({ username: cred.username }),
    afterJson: JSON.stringify({ username: next }),
  });
  return c.json({ ok: true, username: next });
});

// --- Dealers ---------------------------------------------------------------

app.get('/api/dealers', async (c) => {
  const q = parse(listQuerySchema, {
    activity: c.req.query('activity') ?? 'all',
    q: c.req.query('q') ?? undefined,
  });
  const dealers = await listDealers(getDb(c.env.DB), q);
  return c.json({ dealers });
});

app.post('/api/dealers', async (c) => {
  const input = parse(dealerCreateSchema, await jsonBody(c));
  const dealer = await createDealer(getDb(c.env.DB), input);
  return c.json({ dealer }, 201);
});

app.get('/api/dealers/:id', async (c) => {
  const id = intParam(c.req.param('id'), 'id');
  const db = getDb(c.env.DB);
  const dealer = await getDealer(db, id);
  if (!dealer) throw new HttpError(404, { error: 'dealer_not_found' });
  const balances = await getDealerBalances(db, id);
  return c.json({ dealer, balances });
});

app.patch('/api/dealers/:id', async (c) => {
  const id = intParam(c.req.param('id'), 'id');
  const patch = parse(dealerUpdateSchema, await jsonBody(c));
  const dealer = await updateDealer(getDb(c.env.DB), id, patch);
  if (!dealer) throw new HttpError(404, { error: 'dealer_not_found' });
  return c.json({ dealer });
});

app.post('/api/dealers/:id/archive', async (c) => {
  const id = intParam(c.req.param('id'), 'id');
  const dealer = await archiveDealer(getDb(c.env.DB), id);
  if (!dealer) throw new HttpError(404, { error: 'dealer_not_found' });
  return c.json({ dealer });
});

app.get('/api/dealers/:id/ledger', async (c) => {
  const id = intParam(c.req.param('id'), 'id');
  const account: Account = c.req.query('account') === 'current' ? 'current' : 'actual';
  const db = getDb(c.env.DB);
  const [entries, balancePaise] = await Promise.all([
    getLedger(db, id, account),
    getBalance(db, id, account),
  ]);
  return c.json({ account, headline: { balancePaise, ...describeBalance(balancePaise) }, entries });
});

// --- Transactions & money movements ----------------------------------------

app.get('/api/audit', async (c) => {
  const entries = await getAuditLog(getDb(c.env.DB));
  return c.json({ entries });
});

app.get('/api/suggestions', async (c) => {
  const field = c.req.query('field');
  if (field !== 'item' && field !== 'unit') throw new HttpError(400, { error: 'invalid_field' });
  const values = await getSuggestions(getDb(c.env.DB), field);
  return c.json({ values });
});

app.get('/api/transactions/:id', async (c) => {
  const id = intParam(c.req.param('id'), 'id');
  const detail = await getTransactionDetail(getDb(c.env.DB), id);
  if (!detail) throw new HttpError(404, { error: 'transaction_not_found' });
  return c.json({ transaction: detail });
});

app.post('/api/transactions', async (c) => {
  const input = parse(transactionCreateSchema, await jsonBody(c));
  const db = getDb(c.env.DB);
  const dealer = await getDealer(db, input.dealerId);
  if (!dealer || dealer.isArchived)
    throw new HttpError(400, { error: 'dealer_missing_or_archived' });
  const result = await postTransaction(db, input);
  return c.json({ transaction: result }, 201);
});

app.post('/api/movements', async (c) => {
  const input = parse(movementCreateSchema, await jsonBody(c));
  const db = getDb(c.env.DB);
  const dealer = await getDealer(db, input.dealerId);
  if (!dealer || dealer.isArchived)
    throw new HttpError(400, { error: 'dealer_missing_or_archived' });
  const result = await postMovement(db, input);
  return c.json({ movement: result }, 201);
});

app.post('/api/transactions/:id/void', async (c) => {
  const id = intParam(c.req.param('id'), 'id');
  const result = await voidSource(getDb(c.env.DB), { sourceType: 'transaction', sourceId: id });
  return c.json({ voided: result });
});

app.post('/api/movements/:id/void', async (c) => {
  const id = intParam(c.req.param('id'), 'id');
  const result = await voidSource(getDb(c.env.DB), { sourceType: 'movement', sourceId: id });
  return c.json({ voided: result });
});

app.notFound((c) => c.json({ ok: false, error: 'not_found' }, 404));

export default app;
