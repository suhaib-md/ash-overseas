/**
 * Canonical Drizzle schema — mirrors SRS §12 exactly.
 *
 * All money is stored as integer paise. `quantity` and `gst_rate` are real values
 * used for display/computation only; the authoritative monetary figures are always
 * the integer paise amounts.
 */
import { sqliteTable, integer, text, real, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const dealers = sqliteTable(
  'dealers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    contact: text('contact'),
    address: text('address'),
    gstin: text('gstin'),
    stateCode: text('state_code'), // "33" = TN, "07" = Delhi, etc.
    type: text('type', { enum: ['supplier', 'buyer', 'both'] })
      .notNull()
      .default('both'), // list filter ONLY — never splits balance
    isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index('idx_dealers_archived').on(t.isArchived)],
);

export const transactions = sqliteTable(
  'transactions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    humanId: text('human_id').notNull().unique(), // e.g. "SALE-2026-06-0039"
    referenceTag: text('reference_tag'), // owner's own tag, e.g. "ASH 39"
    mode: text('mode', { enum: ['purchase', 'sale'] }).notNull(),
    dealerId: integer('dealer_id')
      .notNull()
      .references(() => dealers.id),
    date: integer('date', { mode: 'timestamp' }).notNull(),
    taxType: text('tax_type', { enum: ['intra', 'inter', 'none'] })
      .notNull()
      .default('intra'),
    invoiceNo: text('invoice_no'), // optional
    invoiceDate: integer('invoice_date', { mode: 'timestamp' }),
    irn: text('irn'),
    ewayBill: text('eway_bill'),
    discountPaise: integer('discount_paise').notNull().default(0),
    freightPaise: integer('freight_paise').notNull().default(0),
    roundOffPaise: integer('round_off_paise').notNull().default(0),
    isCreditDebitNote: integer('is_credit_debit_note', { mode: 'boolean' })
      .notNull()
      .default(false),
    notes: text('notes'),
    isVoided: integer('is_voided', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index('idx_transactions_dealer').on(t.dealerId)],
);

export const transactionLines = sqliteTable('transaction_lines', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  transactionId: integer('transaction_id')
    .notNull()
    .references(() => transactions.id),
  itemName: text('item_name').notNull(), // free text, no master
  quantity: real('quantity').notNull(),
  unit: text('unit'), // free text: kg, pcs, lot...
  actualRatePaise: integer('actual_rate_paise').notNull(),
  actualAmountPaise: integer('actual_amount_paise').notNull(),
  currentRatePaise: integer('current_rate_paise').notNull(),
  currentAmountPaise: integer('current_amount_paise').notNull(),
  gstRate: real('gst_rate').notNull().default(0), // percent, e.g. 18
  gstAmountPaise: integer('gst_amount_paise').notNull().default(0), // computed on current value
});

export const moneyMovements = sqliteTable(
  'money_movements',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    dealerId: integer('dealer_id')
      .notNull()
      .references(() => dealers.id),
    mode: text('mode', { enum: ['purchase', 'sale'] }), // optional context label
    date: integer('date', { mode: 'timestamp' }).notNull(),
    direction: text('direction', { enum: ['received', 'paid'] }).notNull(), // received = from dealer
    amountPaise: integer('amount_paise').notNull(),
    method: text('method', { enum: ['cash', 'bank', 'cheque', 'upi'] }),
    reference: text('reference'),
    accountScope: text('account_scope', { enum: ['actual', 'current', 'both'] })
      .notNull()
      .default('actual'),
    notes: text('notes'),
    isVoided: integer('is_voided', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index('idx_movements_dealer').on(t.dealerId)],
);

export const ledgerEntries = sqliteTable(
  'ledger_entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    dealerId: integer('dealer_id')
      .notNull()
      .references(() => dealers.id),
    account: text('account', { enum: ['actual', 'current'] }).notNull(),
    entryDate: integer('entry_date', { mode: 'timestamp' }).notNull(),
    sourceType: text('source_type', {
      enum: ['transaction', 'movement', 'opening', 'adjustment'],
    }).notNull(),
    sourceId: integer('source_id'),
    debitPaise: integer('debit_paise').notNull().default(0), // dealer owes business more
    creditPaise: integer('credit_paise').notNull().default(0), // business owes dealer more
    runningBalancePaise: integer('running_balance_paise').notNull(), // + dealer owes, − business owes
    label: text('label'), // sale | purchase | receipt | payment
    description: text('description'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  // Hot path: replay + balance reads by dealer/account in date order (tiebreak id).
  (t) => [index('idx_ledger_dealer_account_date').on(t.dealerId, t.account, t.entryDate, t.id)],
);

export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  action: text('action').notNull(), // create | void | edit | login
  entity: text('entity').notNull(),
  entityId: integer('entity_id'),
  beforeJson: text('before_json'),
  afterJson: text('after_json'),
  at: integer('at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});
