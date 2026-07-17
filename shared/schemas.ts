/**
 * Zod schemas — the validation boundary (CLAUDE.md → Security L3). Money is integer
 * paise only (floats/NaN rejected). Reused on the client for form validation.
 */
import { z } from 'zod';

/** Integer paise. `.int()` rejects floats and NaN. Bounded well under 2^53. */
const MAX_PAISE = 1_000_000_000_000; // ₹1,000 crore — generous ceiling, DoS/overflow guard
const paise = z.number().int().min(-MAX_PAISE).max(MAX_PAISE);
const nonNegPaise = z.number().int().min(0).max(MAX_PAISE);
const positivePaise = z.number().int().min(1).max(MAX_PAISE);

/** SRS §10.8 — a date may not be in the future beyond today (server local day). */
function notFuture(d: Date): boolean {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return d.getTime() <= end.getTime();
}
const pastDate = z.coerce.date().refine(notFuture, 'Date may not be in the future');

export const dealerCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  contact: z.string().max(200).nullish(),
  address: z.string().max(1000).nullish(),
  gstin: z.string().max(20).nullish(),
  stateCode: z.string().max(2).nullish(),
  type: z.enum(['supplier', 'buyer', 'both']).default('both'),
  /** Optional signed opening balances (positive → dealer owes you). */
  openingActualPaise: paise.nullish(),
  openingCurrentPaise: paise.nullish(),
});
export type DealerCreateInput = z.infer<typeof dealerCreateSchema>;

export const dealerUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  contact: z.string().max(200).nullish(),
  address: z.string().max(1000).nullish(),
  gstin: z.string().max(20).nullish(),
  stateCode: z.string().max(2).nullish(),
  type: z.enum(['supplier', 'buyer', 'both']).optional(),
});
export type DealerUpdateInput = z.infer<typeof dealerUpdateSchema>;

export const transactionLineSchema = z.object({
  itemName: z.string().trim().min(1).max(200),
  quantity: z.number().positive().max(1_000_000_000),
  unit: z.string().max(50).nullish(),
  actualRatePaise: nonNegPaise,
  currentRatePaise: nonNegPaise,
  gstRatePercent: z.number().min(0).max(100),
});

export const transactionCreateSchema = z.object({
  dealerId: z.number().int().positive(),
  date: pastDate,
  mode: z.enum(['sale', 'purchase']),
  taxType: z.enum(['intra', 'inter', 'none']).default('intra'),
  lines: z.array(transactionLineSchema).min(1).max(200),
  discountPaise: nonNegPaise.default(0),
  freightPaise: nonNegPaise.default(0),
  referenceTag: z.string().max(100).nullish(),
  invoiceNo: z.string().max(100).nullish(),
  invoiceDate: z.coerce.date().nullish(),
  irn: z.string().max(100).nullish(),
  ewayBill: z.string().max(100).nullish(),
  notes: z.string().max(2000).nullish(),
  isCreditDebitNote: z.boolean().default(false),
});
export type TransactionCreateInput = z.infer<typeof transactionCreateSchema>;

export const movementCreateSchema = z.object({
  dealerId: z.number().int().positive(),
  date: pastDate,
  direction: z.enum(['received', 'paid']),
  amountPaise: positivePaise,
  accountScope: z.enum(['actual', 'current', 'both']).default('actual'),
  method: z.enum(['cash', 'bank', 'cheque', 'upi']).nullish(),
  reference: z.string().max(200).nullish(),
  notes: z.string().max(2000).nullish(),
  mode: z.enum(['sale', 'purchase']).nullish(),
});
export type MovementCreateInput = z.infer<typeof movementCreateSchema>;

export const listQuerySchema = z.object({
  activity: z.enum(['purchase', 'sale', 'all']).default('all'),
  q: z.string().max(200).optional(),
});

/** Username: 3–64 chars, letters/digits/._- (case-insensitive at login). */
export const usernameField = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/, 'Use only letters, digits, dot, underscore or hyphen');

/** A new password to set (min 8). The login field stays lenient (min 1). */
export const newPasswordField = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(256);

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: newPasswordField,
});

export const changeUsernameSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newUsername: usernameField,
});
