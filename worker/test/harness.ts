import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { migrate } from 'drizzle-orm/d1/migrator';
import { getDb, type Db } from '../db/client';
import {
  dealers,
  ledgerEntries,
  transactionLines,
  transactions,
  moneyMovements,
  auditLog,
} from '../db/schema';

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../migrations',
);

export interface TestHarness {
  d1: D1Database;
  db: Db;
  reset(): Promise<void>;
  dispose(): Promise<void>;
}

/** Spin up a real local D1 (Miniflare), apply migrations, and hand back a Drizzle client. */
export async function createHarness(): Promise<TestHarness> {
  const mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok"); } };',
    compatibilityDate: '2026-07-07',
    d1Databases: { DB: 'ash-test' },
  });
  const d1 = (await mf.getD1Database('DB')) as unknown as D1Database;
  const db = getDb(d1);
  await migrate(db, { migrationsFolder });

  return {
    d1,
    db,
    async reset() {
      await db.batch([
        db.delete(ledgerEntries),
        db.delete(transactionLines),
        db.delete(transactions),
        db.delete(moneyMovements),
        db.delete(auditLog),
        db.delete(dealers),
      ]);
      try {
        await d1.exec('DELETE FROM sqlite_sequence;');
      } catch {
        /* sqlite_sequence may not exist until the first autoincrement insert */
      }
    },
    async dispose() {
      await mf.dispose();
    },
  };
}
