import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { appCredentials } from '../db/schema';

/**
 * Single-user login credentials, stored as one row (id = 1) in D1 so the owner can
 * change them from inside the app. Password is only ever a PBKDF2 hash (see auth.ts).
 */
export interface Credentials {
  username: string;
  passwordHash: string;
}

export async function getCredentials(db: Db): Promise<Credentials | null> {
  const rows = await db
    .select({ username: appCredentials.username, passwordHash: appCredentials.passwordHash })
    .from(appCredentials)
    .where(eq(appCredentials.id, 1))
    .limit(1);
  return rows[0] ?? null;
}

/** Insert or replace the single credential row (used by first-time provisioning). */
export async function setCredentials(db: Db, cred: Credentials): Promise<void> {
  await db
    .insert(appCredentials)
    .values({ id: 1, username: cred.username, passwordHash: cred.passwordHash })
    .onConflictDoUpdate({
      target: appCredentials.id,
      set: {
        username: cred.username,
        passwordHash: cred.passwordHash,
        updatedAt: sql`(unixepoch())`,
      },
    });
}

export async function updateUsername(db: Db, username: string): Promise<void> {
  await db
    .update(appCredentials)
    .set({ username, updatedAt: sql`(unixepoch())` })
    .where(eq(appCredentials.id, 1));
}

export async function updatePasswordHash(db: Db, passwordHash: string): Promise<void> {
  await db
    .update(appCredentials)
    .set({ passwordHash, updatedAt: sql`(unixepoch())` })
    .where(eq(appCredentials.id, 1));
}
