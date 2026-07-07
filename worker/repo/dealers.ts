import { and, eq, inArray, like } from 'drizzle-orm';
import type { Db } from '../db/client';
import { dealers } from '../db/schema';
import type { DealerCreateInput, DealerUpdateInput } from '../../shared/schemas';
import { postOpening } from '../ledger/post';
import { getBalance } from './ledger';

export type DealerRow = typeof dealers.$inferSelect;

export async function createDealer(db: Db, input: DealerCreateInput): Promise<DealerRow> {
  const rows = await db
    .insert(dealers)
    .values({
      name: input.name,
      contact: input.contact ?? null,
      address: input.address ?? null,
      gstin: input.gstin ?? null,
      stateCode: input.stateCode ?? null,
      type: input.type,
      isArchived: false,
    })
    .returning();
  const dealer = rows[0]!;

  const now = new Date();
  if (input.openingActualPaise != null && input.openingActualPaise !== 0) {
    await postOpening(db, {
      dealerId: dealer.id,
      account: 'actual',
      signedBalancePaise: input.openingActualPaise,
      date: now,
    });
  }
  if (input.openingCurrentPaise != null && input.openingCurrentPaise !== 0) {
    await postOpening(db, {
      dealerId: dealer.id,
      account: 'current',
      signedBalancePaise: input.openingCurrentPaise,
      date: now,
    });
  }
  return dealer;
}

export async function getDealer(db: Db, id: number): Promise<DealerRow | null> {
  const rows = await db.select().from(dealers).where(eq(dealers.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateDealer(
  db: Db,
  id: number,
  patch: DealerUpdateInput,
): Promise<DealerRow | null> {
  const set: Partial<typeof dealers.$inferInsert> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.contact !== undefined) set.contact = patch.contact ?? null;
  if (patch.address !== undefined) set.address = patch.address ?? null;
  if (patch.gstin !== undefined) set.gstin = patch.gstin ?? null;
  if (patch.stateCode !== undefined) set.stateCode = patch.stateCode ?? null;
  if (patch.type !== undefined) set.type = patch.type;

  if (Object.keys(set).length === 0) return getDealer(db, id);
  const rows = await db.update(dealers).set(set).where(eq(dealers.id, id)).returning();
  return rows[0] ?? null;
}

export async function archiveDealer(db: Db, id: number): Promise<DealerRow | null> {
  const rows = await db
    .update(dealers)
    .set({ isArchived: true })
    .where(eq(dealers.id, id))
    .returning();
  return rows[0] ?? null;
}

export interface DealerListItem {
  id: number;
  name: string;
  type: 'supplier' | 'buyer' | 'both';
  gstin: string | null;
  actualBalancePaise: number;
}

/** List non-archived dealers for an activity, with each dealer's inline actual balance. */
export async function listDealers(
  db: Db,
  opts: { activity: 'purchase' | 'sale' | 'all'; q?: string },
): Promise<DealerListItem[]> {
  const conds = [eq(dealers.isArchived, false)];
  if (opts.activity === 'purchase') conds.push(inArray(dealers.type, ['supplier', 'both']));
  else if (opts.activity === 'sale') conds.push(inArray(dealers.type, ['buyer', 'both']));
  if (opts.q && opts.q.trim() !== '') conds.push(like(dealers.name, `%${opts.q.trim()}%`));

  const rows = await db
    .select({ id: dealers.id, name: dealers.name, type: dealers.type, gstin: dealers.gstin })
    .from(dealers)
    .where(and(...conds))
    .orderBy(dealers.name);

  // Balance per dealer via the same stored-value read the detail view uses. (A raw
  // correlated subquery here silently returned 0 under the Workers D1 driver.)
  return Promise.all(
    rows.map(async (r) => ({ ...r, actualBalancePaise: await getBalance(db, r.id, 'actual') })),
  );
}
