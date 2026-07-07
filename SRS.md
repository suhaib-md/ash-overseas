# ASH Overseas — Trading Ledger

## Software Requirements Specification

**Prepared by:** Suhaib
**Status:** Approved scope — ready for development

---

## Table of Contents

1. Introduction
2. Glossary
3. Business Context
4. Core Concepts
5. Sign Convention & Account Behaviour
6. Worked Scenarios (Acceptance Tests)
7. Posting Rules
8. GST, Rounding & Adjustments
9. Functional Requirements
10. User Interface Specification
11. Data Model
12. Database Schema (Cloudflare D1 / Drizzle)
13. Ledger Computation & Integrity
14. Non-Functional Requirements
15. Technology Stack & Deployment
16. Maintenance & Handoff
17. Scope Boundaries
18. Assumptions & Open Items
19. Delivery Phases

---

## 1. Introduction

### 1.1 Purpose

This document specifies, in full, the requirements for a web application that records the day-to-day buying and selling activity of ASH Overseas. The application replaces the hand-written note records and paper ledgers currently used to track money and goods exchanged with dealers. It is the single source of definition for the application's behaviour, data, and technology.

### 1.2 Scope

The application is a private, internal record-keeping tool. It maintains, for every dealer, a running account of goods sent and received and money paid and received, valued two ways: the **actual** values (the real money and goods that changed hands) and the **current** values (the figures used on official invoices for tax purposes). It produces, at any moment, the net position with each dealer — how much that dealer owes the business, or how much the business owes that dealer.

The application does not file taxes, generate legal invoices, or replace the accounting software used for statutory filing. It is a faithful, searchable, always-current digital version of the owner's working notebook.

### 1.3 Intended Users

A single user — the business owner — operates the application. The owner records transactions and reads balances. A separate technical maintainer is responsible for the codebase and deployment, but does not use the application for business operations. The application is designed for single-user operation with manual account provisioning; there is no public sign-up.

### 1.4 Document Conventions

All monetary values in this document are shown in rupees for readability. Internally the application stores every monetary value as an integer number of **paise** (₹1 = 100 paise). The terms "debit" and "credit" are defined in Section 5 relative to the business's point of view.

---

## 2. Glossary

| Term                     | Meaning                                                                                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dealer**               | Any party the business buys from or sells to. A dealer may be a supplier, a buyer, or both.                                                                                  |
| **Transaction**          | A movement of goods — a purchase from a dealer or a sale to a dealer — consisting of one or more line items.                                                                 |
| **Line item**            | A single item within a transaction: an item name, quantity, unit, and its two rates (actual and current).                                                                    |
| **Money movement**       | A movement of money — an advance, a payment, or a receipt — independent of any single transaction.                                                                           |
| **Actual account**       | The record of real money and real goods. The figures the owner runs the business on.                                                                                         |
| **Current account**      | The record of declared/invoiced figures used for GST and official paperwork.                                                                                                 |
| **Consolidated balance** | A single running balance per dealer per account, reflecting the net position from all activity in both directions.                                                           |
| **Advance**              | Money received from a dealer (or paid to a dealer) ahead of goods, held against future delivery. Represented simply as a money movement that moves the consolidated balance. |
| **Settlement**           | Clearing an outstanding balance, by goods or by money. Represented as ordinary transactions or money movements.                                                              |
| **Reference tag**        | The owner's own shipment label (for example "ASH 39"), recorded alongside the system identifier.                                                                             |
| **Paise**                | One-hundredth of a rupee; the integer unit in which all money is stored.                                                                                                     |

---

## 3. Business Context

### 3.1 What the Business Does

ASH Overseas trades materials — including metal castings and scrap (and other traded materials as they arise) — buying from some dealers and selling to others. Some dealers are both suppliers and buyers at different times. The business operates on credit and on advances: money and goods rarely settle in a single immediate exchange. A dealer may pre-pay a large advance against which goods are delivered over time; equally, goods may be delivered first and paid for later. The result is a continuously shifting web of who owes whom.

### 3.2 The Central Problem

Tracked on paper, this becomes hard to manage: there is no single, reliable, always-current view of the net position with each dealer; computing the running balance after each shipment and payment is manual and error-prone; and the figures that appear on official invoices differ from the real figures, so the owner effectively keeps two parallel sets of numbers in his head and on loose sheets. The application exists to hold both sets of numbers accurately, keep the running balance correct automatically, and present the net position with each dealer instantly.

### 3.3 Operating Pattern

The owner thinks in terms of two top-level activities — **purchase** and **sale** — and, under each, a list of the dealers he transacts with for that activity. Selecting a dealer reveals their account. Within a dealer's account there are two views of the same activity: the **actual** view and the **current** view.

---

## 4. Core Concepts

The entire application is built on two ideas. Everything else serves them.

### 4.1 Two Valuations of the Same Goods

Every shipment of goods is valued two ways at the same time:

|                         | **Actual account**                                                              | **Current account**                                                   |
| ----------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Purpose**             | The real money and goods that changed hands — the working truth of the business | The declared figures placed on official invoices for GST and tax      |
| **Rate**                | The true negotiated rate (for example ₹33/kg)                                   | The declared invoice rate (for example ₹24/kg)                        |
| **How the rate is set** | Entered manually for each line item                                             | Entered manually for each line item, independently of the actual rate |
| **GST**                 | Carries the GST as real cash that genuinely moves                               | GST is computed on the current (declared) value                       |
| **Also records**        | —                                                                               | Invoice number and date (optional), tax type                          |

The current rate is entered freely for every line. It is **not** derived from the actual rate by any fixed formula, and it is **not** constrained to be lower than the actual rate — in most cases it is lower, but it may occasionally be equal or higher. The two valuations describe the **same physical goods**; they are never two separate shipments.

### 4.2 One Consolidated Balance Per Dealer

For each dealer, each account (actual and current) maintains a **single running balance**. Goods and money flowing in either direction move this one number up or down. There are no separate advance "buckets" to allocate shipments against, and no first-in-first-out matching. A dealer who has given an advance simply has a balance indicating the business owes them; as goods are delivered, that balance moves toward zero and can cross it.

### 4.3 Purchase and Sale Are Labels, Not Separate Balances

Purchase and Sale organise the interface — they filter the dealer lists and set the type of a new entry — but they do **not** split a dealer's money into two pots. A dealer the business both buys from and sells to appears in both lists and has **one** consolidated balance per account that reflects all activity together.

---

## 5. Sign Convention & Account Behaviour

Each dealer has one signed running balance per account. The sign is defined from the business's point of view:

- **Positive balance → the dealer owes the business** (a receivable).
- **Negative balance → the business owes the dealer** (a payable; for example, the dealer is holding an advance with the business).
- **Zero → settled.**

Two ledger movements drive the balance:

- A **debit** increases what the dealer owes the business (moves the balance up, toward positive).
- A **credit** increases what the business owes the dealer (moves the balance down, toward negative).

The running balance after any entry equals the previous balance plus debits minus credits, in date order:

```
running_balance = Σ(debit) − Σ(credit)
```

The user never sees the words "debit" and "credit." The interface translates the signed balance into plain language: **"Dealer owes you ₹X"** when positive, **"You owe dealer ₹X"** when negative, **"Settled"** at zero.

---

## 6. Worked Scenarios (Acceptance Tests)

These scenarios define correct behaviour precisely. The ledger engine must reproduce every figure below exactly. They are the application's primary acceptance tests.

### 6.1 Scenario A — Money and goods moving both ways (Actual account)

A dealer the business both buys from and sells to.

| Step | Event                                 | Posting         | Balance                          |
| ---- | ------------------------------------- | --------------- | -------------------------------- |
| 1    | Dealer gives the business ₹6,00,000   | credit 6,00,000 | −6,00,000 (business owes dealer) |
| 2    | Business sends goods worth ₹2,00,000  | debit 2,00,000  | −4,00,000                        |
| 3    | Business receives goods worth ₹50,000 | credit 50,000   | −4,50,000                        |
| 4    | Business pays dealer ₹1,00,000        | debit 1,00,000  | −3,50,000                        |

A single number moves both ways. The headline reads "You owe dealer ₹3,50,000."

### 6.2 Scenario B — Advance against two shipments (Actual account)

A buyer pre-pays an advance, then goods are delivered against it. GST shown is computed on the declared (current) value and is treated as real cash in the actual account.

| Step | Event                       | Calculation                                             | Posting         | Balance       |
| ---- | --------------------------- | ------------------------------------------------------- | --------------- | ------------- |
| 1    | Advance received from buyer | —                                                       | credit 8,08,867 | −8,08,867     |
| 2    | Sale, shipment tag "ASH 39" | 9,510 kg × ₹33 = 3,13,830 actual; invoice GST = 41,083  | debit 3,54,913  | −4,53,954     |
| 3    | Sale, shipment tag "ASH 42" | 11,650 kg × ₹26 = 3,02,900 actual; invoice GST = 33,552 | debit 3,36,452  | **−1,17,502** |

Final balance −1,17,502 → **"You owe dealer ₹1,17,502."** This is the returnable balance the owner needs to see at a glance; it can be settled in goods or cash.

**Rule demonstrated:** a sale debits the actual account by **(actual goods value + invoice GST)**, where invoice GST is computed on the current/declared value.

### 6.3 Scenario C — The same two shipments (Current account)

The current account records only declared/invoiced figures:

| Shipment | Declared value          | GST    | Invoice total |
| -------- | ----------------------- | ------ | ------------- |
| ASH 39   | 2,28,240 (9,510 × ₹24)  | 41,083 | 2,69,323      |
| ASH 42   | 1,86,400 (11,650 × ₹16) | 33,552 | 2,19,952      |

The advance, being cash, posts only to the actual account, so the current account reflects the invoiced position independently. The difference between actual goods value and declared value exists **only** in the actual account — this is the entire reason both accounts are kept.

### 6.4 Scenario D — Balance crossing zero

Continuing Scenario B, if the business then delivers a further shipment worth ₹2,00,000 (actual + GST), the actual balance moves from −1,17,502 to +82,498, and the headline flips to "Dealer owes you ₹82,498." The same balance must represent both directions without any special handling.

---

## 7. Posting Rules

For each kind of event, the application writes one ledger entry per affected account. "Goods value" means the sum of line amounts at the relevant rate (actual or current). "GST" means the invoice GST computed on the current value (Section 8).

| Event                            | Actual account                                     | Current account                                                 |
| -------------------------------- | -------------------------------------------------- | --------------------------------------------------------------- |
| **Sale** (goods to dealer)       | debit (actual goods value + GST)                   | debit (current goods value + GST)                               |
| **Purchase** (goods from dealer) | credit (actual goods value + GST)                  | credit (current goods value + GST)                              |
| **Money received** from dealer   | credit (amount)                                    | credit (amount) — only if the movement's scope includes current |
| **Money paid** to dealer         | debit (amount)                                     | debit (amount) — only if the movement's scope includes current  |
| **Correction / void**            | reversing entry equal and opposite to the original | reversing entry equal and opposite to the original              |

Notes:

- A money movement specifies an **account scope** — _actual only_, _current only_, or _both_ — because a cash advance typically affects only the actual account, while an official bank receipt against an invoice may affect both. The default scope is _actual_.
- A transaction always posts to both accounts (every shipment has both an actual and a current valuation).
- Discount and freight adjust the posted total (Section 8) before the ledger entry is written.

---

## 8. GST, Rounding & Adjustments

### 8.1 GST Basis

GST is always computed on the **current (declared)** value of a line, never on the actual value. The GST rate is entered manually for each line (there is no rate master), because rates vary by item.

For a line with current value `V` (in paise) and rate `r` percent:

```
line_gst_paise = round(V × r / 100)
```

### 8.2 Intra-State vs Inter-State

Each transaction carries a **tax type**:

- **Intra-state** (within Tamil Nadu): the GST splits into CGST and SGST, each half the total. For display: `CGST = SGST = line_gst_paise / 2` (computed as `round(V × r / 200)` each).
- **Inter-state** (for example sales to Delhi): the full GST is **IGST**.
- **None**: no GST on the transaction.

The split is a display concern; the ledger uses the single GST total per line.

### 8.3 Invoice Rounding

Components are computed to the paise. The transaction's grand total (current side) is rounded to the nearest rupee for invoice purposes, and the difference is stored as a **round-off** value. For example, a taxable value of ₹2,28,240 at 18% gives CGST ₹20,541.60 and SGST ₹20,541.60; the raw total ₹2,69,323.20 rounds to ₹2,69,323.00 with a round-off of −₹0.20.

The rounded totals are what post to the ledger, so the running balances match the owner's rupee-based working figures.

### 8.4 Discount and Freight

Discount and freight are optional per-transaction adjustments. When present, they adjust the posted total. They are recorded so that the figures reconcile, and apply to whichever account(s) the transaction posts to as configured per transaction.

### 8.5 Credit / Debit Notes and Returns

A transaction may be marked as a credit/debit note or a return. Functionally it posts to the ledger like any transaction but in the reversing direction, and is labelled as such so it is distinguishable in the dealer's history.

---

## 9. Functional Requirements

### 9.1 Dealer Management

- **FR-D1** Create a dealer with name, contact, address, GSTIN, and state code.
- **FR-D2** A dealer carries a type (supplier, buyer, or both) used only to filter the Purchase and Sale lists; the type never splits the balance.
- **FR-D3** Archive a dealer without deleting their history.
- **FR-D4** A dealer may be selected for both purchase and sale activity and retains one consolidated balance per account.
- **FR-D5** Optionally seed a dealer with a starting position (an opening entry) per account.

### 9.2 Transactions (Goods)

- **FR-T1** Record a transaction as either a purchase or a sale, against one dealer, on a given date.
- **FR-T2** Add one or more line items, each with a freely typed item name, quantity, freely typed unit, an actual rate, and a current rate.
- **FR-T3** Enter a GST rate per line; the application computes the GST amount on the current value.
- **FR-T4** Select the tax type (intra-state, inter-state, none) for the transaction.
- **FR-T5** Optionally record an invoice number and invoice date, the owner's reference tag (for example "ASH 39"), discount, freight, and free-text notes.
- **FR-T6** Optionally mark the transaction as a credit/debit note or return.
- **FR-T7** On save, post the correct entries to both accounts per Section 7 and update running balances.
- **FR-T8** Assign every transaction a human-readable identifier.

### 9.3 Money Movements

- **FR-M1** Record money received from a dealer or money paid to a dealer, on a given date, with an amount and an optional method (cash, bank, cheque, UPI) and reference.
- **FR-M2** Specify the account scope (actual, current, or both) for each movement.
- **FR-M3** On save, post the correct entries and update running balances.

### 9.4 Ledger & Balances

- **FR-L1** Maintain one signed running balance per dealer per account.
- **FR-L2** Display the actual balance as the dealer's headline, in plain language (owes you / you owe / settled).
- **FR-L3** Show each dealer's full chronological history per account, with the running balance after every entry.
- **FR-L4** The balance must represent both directions seamlessly and cross zero without special handling.

### 9.5 Corrections & Audit

- **FR-A1** Financial records are never hard-deleted. A correction voids the original by posting an equal and opposite reversing entry and flags the source as voided.
- **FR-A2** Every create, void, and edit is written to an audit log with before/after values and a timestamp.

### 9.6 Search & Navigation

- **FR-N1** From the home screen, choose Purchase or Sale to see the relevant dealer list.
- **FR-N2** Search and filter dealers by name within a list, with each dealer's current balance shown inline.
- **FR-N3** Open a dealer to view and switch between the actual and current accounts.

---

## 10. User Interface Specification

### 10.1 Navigation Map

```
[ Home ]
   ├── [ PURCHASE ] → Dealer list (purchase) → [ Dealer ]
   └── [ SALE ]     → Dealer list (sale)     → [ Dealer ]
                                                   │
                                 ┌─────────────────┴─────────────────┐
                                 │ [ Actual account ]  [ Current account ] │
                                 │  running balance      invoice values    │
                                 │  goods + money         + GST, inv no/date │
                                 │  "owes you / you owe"                      │
                                 └────────────────────────────────────────────┘
```

### 10.2 Home

Shows the two primary buttons (Purchase, Sale) and a list of dealers with their current actual balance and direction (owes you / you owe). Provides quick access to create a new dealer.

### 10.3 Dealer List (per activity)

A searchable list of dealers relevant to the chosen activity, each row showing name and current actual balance. Selecting a dealer opens their detail. A "new entry" action pre-sets the mode (purchase or sale).

### 10.4 Dealer Detail

Two tabs — **Actual** and **Current** — over the same dealer:

- A prominent headline balance in plain language.
- A chronological list of entries (transactions and money movements), each showing date, label (sale, purchase, receipt, payment), description/reference tag, the amount, and the running balance after it.
- Actions to add a transaction or a money movement, and to void an existing entry.
- The Current tab additionally surfaces invoice number, invoice date, tax type, and GST for each transaction.

### 10.5 New Transaction

Fields: mode (purchase/sale), dealer, date, tax type; a repeatable line-item editor (item name, quantity, unit, actual rate → actual amount, current rate → current amount, GST rate → GST amount); optional invoice number, invoice date, reference tag, discount, freight, credit/debit-note marker, notes. A live summary shows the actual total, the current/invoice total with GST split, and round-off. Validation per Section 10.8.

### 10.6 New Money Movement

Fields: dealer, date, direction (received/paid), amount, method, reference, account scope, notes.

### 10.7 Display Rules

- All amounts display in rupees with thousands separators, formatted from the stored paise at render time only.
- Balances always carry a plain-language direction, never a bare sign.
- Voided entries are shown struck through with their reversing entry adjacent.

### 10.8 Validation Rules

- Quantity and rates must be non-negative numbers; at least one line item is required for a transaction.
- Amount must be greater than zero for a money movement.
- GST rate, when entered, must be between 0 and 100.
- Date is required and may not be in the future beyond the current day.
- A transaction must reference an existing, non-archived dealer.

---

## 11. Data Model

### 11.1 Entity Overview

- **dealers** — identity and contact details; a type used only for list filtering.
- **transactions** — one goods deal (purchase or sale); header, tax type, optional invoice and adjustment fields.
- **transaction_lines** — the per-item dual valuation and GST.
- **money_movements** — advances, payments, and receipts, with account scope.
- **ledger_entries** — the append-only posted ledger with running balances (the digital khata).
- **audit_log** — a record of every create, void, and edit.

### 11.2 Field Dictionary

**dealers**

| Field       | Type                        | Notes                                  |
| ----------- | --------------------------- | -------------------------------------- |
| id          | integer PK                  |                                        |
| name        | text, required              |                                        |
| contact     | text                        |                                        |
| address     | text                        |                                        |
| gstin       | text                        | dealer's GST number                    |
| state_code  | text                        | for example "33" (TN), "07" (Delhi)    |
| type        | enum(supplier, buyer, both) | list filter only; never splits balance |
| is_archived | boolean                     | default false                          |
| created_at  | timestamp                   |                                        |

**transactions**

| Field                | Type                     | Notes                           |
| -------------------- | ------------------------ | ------------------------------- |
| id                   | integer PK               |                                 |
| human_id             | text, unique             | for example "SALE-2026-06-0039" |
| reference_tag        | text                     | owner's own tag, e.g. "ASH 39"  |
| mode                 | enum(purchase, sale)     |                                 |
| dealer_id            | integer FK → dealers     |                                 |
| date                 | timestamp                |                                 |
| tax_type             | enum(intra, inter, none) | default intra                   |
| invoice_no           | text                     | optional                        |
| invoice_date         | timestamp                | optional                        |
| irn                  | text                     | optional, stored if known       |
| eway_bill            | text                     | optional                        |
| discount_paise       | integer                  | default 0                       |
| freight_paise        | integer                  | default 0                       |
| round_off_paise      | integer                  | default 0                       |
| is_credit_debit_note | boolean                  | default false                   |
| notes                | text                     |                                 |
| is_voided            | boolean                  | default false                   |
| created_at           | timestamp                |                                 |

**transaction_lines**

| Field                | Type                      | Notes                     |
| -------------------- | ------------------------- | ------------------------- |
| id                   | integer PK                |                           |
| transaction_id       | integer FK → transactions |                           |
| item_name            | text, required            | free text                 |
| quantity             | real, required            |                           |
| unit                 | text                      | free text (kg, pcs, lot…) |
| actual_rate_paise    | integer                   |                           |
| actual_amount_paise  | integer                   | quantity × actual rate    |
| current_rate_paise   | integer                   |                           |
| current_amount_paise | integer                   | quantity × current rate   |
| gst_rate             | real                      | percent, e.g. 18          |
| gst_amount_paise     | integer                   | computed on current value |

**money_movements**

| Field         | Type                          | Notes                  |
| ------------- | ----------------------------- | ---------------------- |
| id            | integer PK                    |                        |
| dealer_id     | integer FK → dealers          |                        |
| mode          | enum(purchase, sale)          | optional context label |
| date          | timestamp                     |                        |
| direction     | enum(received, paid)          | received = from dealer |
| amount_paise  | integer                       |                        |
| method        | enum(cash, bank, cheque, upi) | optional               |
| reference     | text                          | optional               |
| account_scope | enum(actual, current, both)   | default actual         |
| notes         | text                          |                        |
| is_voided     | boolean                       | default false          |
| created_at    | timestamp                     |                        |

**ledger_entries**

| Field                 | Type                                             | Notes                                          |
| --------------------- | ------------------------------------------------ | ---------------------------------------------- |
| id                    | integer PK                                       |                                                |
| dealer_id             | integer FK → dealers                             |                                                |
| account               | enum(actual, current)                            |                                                |
| entry_date            | timestamp                                        |                                                |
| source_type           | enum(transaction, movement, opening, adjustment) |                                                |
| source_id             | integer                                          | id of the originating record                   |
| debit_paise           | integer                                          | default 0                                      |
| credit_paise          | integer                                          | default 0                                      |
| running_balance_paise | integer                                          | + dealer owes business; − business owes dealer |
| label                 | text                                             | sale / purchase / receipt / payment            |
| description           | text                                             |                                                |
| created_at            | timestamp                                        |                                                |

**audit_log**

| Field       | Type       | Notes                        |
| ----------- | ---------- | ---------------------------- |
| id          | integer PK |                              |
| action      | text       | create / void / edit / login |
| entity      | text       | table name                   |
| entity_id   | integer    |                              |
| before_json | text       | prior state                  |
| after_json  | text       | new state                    |
| at          | timestamp  |                              |

---

## 12. Database Schema (Cloudflare D1 / Drizzle)

All money is stored as integer paise. Quantity and GST rate are stored as real values used for display and computation only; the authoritative monetary figures are always the integer paise amounts.

```ts
import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const dealers = sqliteTable('dealers', {
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
});

export const transactions = sqliteTable('transactions', {
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
  isCreditDebitNote: integer('is_credit_debit_note', { mode: 'boolean' }).notNull().default(false),
  notes: text('notes'),
  isVoided: integer('is_voided', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

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

export const moneyMovements = sqliteTable('money_movements', {
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
});

export const ledgerEntries = sqliteTable('ledger_entries', {
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
});

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
```

---

## 13. Ledger Computation & Integrity

### 13.1 Posting on Write

When a transaction or money movement is saved, the application writes the appropriate `ledger_entries` rows (Section 7) inside a single database transaction. The running balance of each new entry is the previous entry's running balance for that dealer and account, plus its debit, minus its credit. Because the application is single-user, write-time computation of the running balance is correct and is the recommended approach.

### 13.2 Replay Function

A pure function `recomputeLedger(dealerId, account)` replays all non-voided entries for a dealer and account in date order and recomputes running balances from zero (or from the dealer's opening entry). It is used after any void or correction, and serves as the test harness. The scenarios in Section 6 are its expected outputs and must pass as automated tests before the application is considered complete.

### 13.3 Corrections

No financial row is ever updated in place in a way that changes its monetary effect, and none is ever hard-deleted. A correction posts a reversing `ledger_entries` row (and an `adjustment` where needed), flags the source record `is_voided`, and writes an `audit_log` entry. The replay function then restores correct running balances.

### 13.4 Integrity Rules

- Every monetary column is an integer; no floating-point money exists anywhere in the system.
- Every ledger entry traces to a source record via `source_type` and `source_id`.
- Opening positions are represented as ledger entries of `source_type = opening`, never as mutable balance fields.
- Voided sources retain their original rows for audit; their effect is neutralised only by reversing entries.

---

## 14. Non-Functional Requirements

### 14.1 Data Integrity

- **NFR-I1** All money stored as integer paise; rupee formatting occurs only at display time.
- **NFR-I2** The ledger is append-only; corrections are reversing entries.
- **NFR-I3** Writes that produce multiple ledger entries occur atomically.

### 14.2 Security & Access Control

- **NFR-S1** Access requires authentication; there is no public access and no self-service sign-up.
- **NFR-S2** The application is an internal record only. It stores official references (invoice number, IRN, e-way bill) when entered, but does not generate official or legal documents.
- **NFR-S3** Monetary values and dealer details must never be written to application logs, error traces, or analytics.
- **NFR-S4** Data is transmitted over HTTPS and stored on infrastructure with encryption at rest.
- **NFR-S5** Because the data records both real and declared figures, access is restricted to the single owner account; any future additional accounts require explicit provisioning.

### 14.3 Backup & Recovery

- **NFR-B1** Automated point-in-time recovery is enabled on the database.
- **NFR-B2** A scheduled export of the full dataset is retained off the primary store on a regular cadence.
- **NFR-B3** A documented restore procedure exists and is verified at least once before handover.

### 14.4 Performance

- **NFR-P1** Dealer lists and dealer detail load within a second for the expected data volume (a single business, on the order of thousands of transactions per year).
- **NFR-P2** Balance reads are served from the stored running balance, not recomputed on every view.

### 14.5 Usability

- **NFR-U1** Balances are always presented in plain language with direction.
- **NFR-U2** The application is usable on a phone browser as well as a desktop, since records are often entered on the move.
- **NFR-U3** Free-text fields (item name, unit) impose no fixed vocabulary; previously used values may be offered as suggestions but never required.

### 14.6 Auditability

- **NFR-A1** Every create, void, and edit is recorded in the audit log with before/after state and timestamp.
- **NFR-A2** Every ledger entry is traceable to its source and reproducible by replay.

---

## 15. Technology Stack & Deployment

| Layer                 | Choice                                                                             | Rationale                                                                              |
| --------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Application framework | Next.js                                                                            | Full-stack React with server routes; familiar and well-supported                       |
| Hosting               | Cloudflare Workers / Pages                                                         | Free collaborative hosting; no per-seat cost; suitable for a low-traffic internal tool |
| Database              | Cloudflare D1 (SQLite)                                                             | Comfortable for the expected scale; integrates natively with the hosting               |
| ORM                   | Drizzle                                                                            | Type-safe schema and queries; the schema in Section 12 is written for it               |
| Authentication        | Cloudflare Access (email one-time PIN) or a hashed password stored in the database | A single user; gating the whole application at the edge avoids custom auth code        |
| Money type            | Integer paise throughout                                                           | Prevents floating-point corruption of financial data                                   |

A lighter single-page application (for example Vite with React and a Hono API on Workers) is an acceptable alternative for a single-user tool; the data model and rules in this document are unchanged by that choice.

**Environment & configuration:** secrets and bindings (database, auth) are configured through the hosting platform's environment, never committed to source control. Separate development and production databases are maintained.

---

## 16. Maintenance & Handoff

The application is built by one developer and handed to a separate maintainer for ongoing upkeep. The handoff is structured so the maintainer has full, independent access at no cost:

- **Source code** lives in a private repository with both the developer and the maintainer as collaborators.
- **Hosting and database** live in a hosting account to which the maintainer is invited as a member with administrative rights, so they can deploy and manage the application without shared credentials.
- A **README** and a short **maintainer runbook** document local setup, environment configuration, the deployment process, the backup and restore procedure, and the ledger replay function.

This arrangement requires no paid team plan and avoids credential sharing.

---

## 17. Scope Boundaries

The following are explicitly **not** part of the application:

- No item, material, or HSN master. Item names, units, and HSN (where relevant) are typed each time; HSN is otherwise kept outside this application.
- No GST rate master; rates are entered per line.
- No advance-allocation engine; the consolidated balance replaces it entirely.
- No integration with, import from, or export to external accounting software.
- No generation of legal invoices or tax returns; official invoices originate elsewhere, and this application only stores their references when entered.
- No bulk data import or historical migration; any opening positions are entered manually as opening entries.
- No analytics, ageing buckets, performance charts, or material-insight reporting.
- No multi-user roles or public access; the application serves a single owner account.

Anything not specified in this document is out of scope for the application and remains in the owner's existing tools.

---

## 18. Assumptions & Open Items

**Assumptions**

- The business operates under a single registered entity and a single GST registration.
- Sales occur both within the state and to other states; both intra-state and inter-state GST are supported.
- The owner is comfortable entering item names, units, rates, and GST manually for each transaction.
- Transaction volume is modest (a single business), well within the chosen infrastructure's limits.

**Open items (non-blocking; to confirm during build)**

- Whether the CGST/SGST split should be derived automatically from a single entered rate, or each part entered separately.
- Whether official bank receipts should post to the current account as well as the actual account by default (the per-movement account scope already supports either; this only sets the default).
- The exact format of the human-readable transaction identifier, and whether it should incorporate the owner's reference tag style.

---

## 19. Delivery Phases

**Phase 1 — Core ledger.** Schema and integer-paise foundation; dealer management; transactions with dual valuation and manual GST; money movements; the append-only ledger; consolidated running balances; dealer detail with actual and current tabs and the plain-language headline. The Section 6 scenarios are implemented as automated tests at the outset.

**Phase 2 — Usability and completeness.** Home dealer list with inline balances; Purchase and Sale entry flows; void and correction via reversing entries; optional fields (invoice number and date, reference tag, discount, freight, credit/debit-note marker, notes); intra/inter-state GST handling; phone-friendly layout.

**Phase 3 — Hardening and handoff.** Authentication; backups and verified restore; audit-log surfacing; README and maintainer runbook; transfer of repository and hosting access to the maintainer.

Subsequent work, only if requested later: invoice document generation, exports, and reporting. These are outside the current scope.

---

_End of specification._
