import { desc } from 'drizzle-orm';
import type { Db } from '../db/client';
import { auditLog } from '../db/schema';

export interface AuditEntry {
  id: number;
  action: string;
  entity: string;
  entityId: number | null;
  beforeJson: string | null;
  afterJson: string | null;
  at: Date;
}

/** Most-recent audit entries (create / void / edit), newest first (NFR-A1). */
export async function getAuditLog(db: Db, limit = 200): Promise<AuditEntry[]> {
  return db.select().from(auditLog).orderBy(desc(auditLog.at), desc(auditLog.id)).limit(limit);
}
