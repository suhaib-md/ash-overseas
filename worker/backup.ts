/**
 * Long-term backup: dump every table to a self-contained SQL file in R2 (NFR-B2).
 * D1 Time Travel already gives 30-day point-in-time recovery for free; this is the
 * off-store retention on a cadence. Restore is documented in SETUP.md.
 */
const TABLES = [
  'dealers',
  'transactions',
  'transaction_lines',
  'money_movements',
  'ledger_entries',
  'audit_log',
] as const;

function sqlValue(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number' || typeof v === 'bigint') return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  return `'${String(v).replace(/'/g, "''")}'`; // escape single quotes
}

export interface BackupEnv {
  DB: D1Database;
  BACKUPS: R2Bucket;
}

/** Produce a SQL dump of all tables and store it in R2. Returns the object key. */
export async function runBackup(env: BackupEnv): Promise<string> {
  let sql = `-- ASH Overseas backup ${new Date().toISOString()}\nPRAGMA foreign_keys=OFF;\n`;

  for (const table of TABLES) {
    const { results } = await env.DB.prepare(`SELECT * FROM ${table}`).all<
      Record<string, unknown>
    >();
    for (const row of results) {
      const cols = Object.keys(row);
      const vals = cols.map((c) => sqlValue(row[c]));
      sql += `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${vals.join(', ')});\n`;
    }
  }

  const key = `backups/${new Date().toISOString().replace(/[:.]/g, '-')}.sql`;
  await env.BACKUPS.put(key, sql, { httpMetadata: { contentType: 'application/sql' } });
  return key;
}
