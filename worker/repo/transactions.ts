import { asc, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { transactions, transactionLines } from '../db/schema';
import { computeTransaction } from '../../shared/ledger';

export interface TransactionLineView {
  itemName: string;
  quantity: number;
  unit: string | null;
  actualRatePaise: number;
  actualAmountPaise: number;
  currentRatePaise: number;
  currentAmountPaise: number;
  gstRate: number;
  gstAmountPaise: number;
}

export interface TransactionDetail {
  id: number;
  humanId: string;
  referenceTag: string | null;
  mode: 'sale' | 'purchase';
  taxType: 'intra' | 'inter' | 'none';
  invoiceNo: string | null;
  invoiceDate: Date | null;
  isCreditDebitNote: boolean;
  isVoided: boolean;
  notes: string | null;
  lines: TransactionLineView[];
  totals: {
    actualGoodsPaise: number;
    currentGoodsPaise: number;
    gstPaise: number;
    cgstPaise: number;
    sgstPaise: number;
    igstPaise: number;
    discountPaise: number;
    freightPaise: number;
    roundOffPaise: number;
    actualPostedPaise: number;
    currentPostedPaise: number;
  };
}

/** Full transaction detail incl. the CGST/SGST-vs-IGST split (recomputed via the engine). */
export async function getTransactionDetail(db: Db, id: number): Promise<TransactionDetail | null> {
  const headerRows = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
  const header = headerRows[0];
  if (!header) return null;

  const lines = await db
    .select()
    .from(transactionLines)
    .where(eq(transactionLines.transactionId, id))
    .orderBy(asc(transactionLines.id));

  const computed = computeTransaction({
    mode: header.mode,
    taxType: header.taxType,
    discountPaise: header.discountPaise,
    freightPaise: header.freightPaise,
    isCreditDebitNote: header.isCreditDebitNote,
    lines: lines.map((l) => ({
      quantity: l.quantity,
      actualRatePaise: l.actualRatePaise,
      currentRatePaise: l.currentRatePaise,
      gstRatePercent: l.gstRate,
    })),
  });

  const sum = (pick: (l: (typeof computed.lines)[number]) => number) =>
    computed.lines.reduce((s, l) => s + pick(l), 0);

  return {
    id: header.id,
    humanId: header.humanId,
    referenceTag: header.referenceTag,
    mode: header.mode,
    taxType: header.taxType,
    invoiceNo: header.invoiceNo,
    invoiceDate: header.invoiceDate,
    isCreditDebitNote: header.isCreditDebitNote,
    isVoided: header.isVoided,
    notes: header.notes,
    lines: lines.map((l) => ({
      itemName: l.itemName,
      quantity: l.quantity,
      unit: l.unit,
      actualRatePaise: l.actualRatePaise,
      actualAmountPaise: l.actualAmountPaise,
      currentRatePaise: l.currentRatePaise,
      currentAmountPaise: l.currentAmountPaise,
      gstRate: l.gstRate,
      gstAmountPaise: l.gstAmountPaise,
    })),
    totals: {
      actualGoodsPaise: computed.actualGoodsPaise,
      currentGoodsPaise: computed.currentGoodsPaise,
      gstPaise: computed.totalGstPaise,
      cgstPaise: sum((l) => l.cgstPaise),
      sgstPaise: sum((l) => l.sgstPaise),
      igstPaise: sum((l) => l.igstPaise),
      discountPaise: header.discountPaise,
      freightPaise: header.freightPaise,
      roundOffPaise: header.roundOffPaise,
      actualPostedPaise: computed.actualPostedPaise,
      currentPostedPaise: computed.currentPostedPaise,
    },
  };
}
