/**
 * API-level integration tests — drive the real Hono routes (Zod validation, CSRF
 * backstop, dealer → transaction → ledger flow) against a real local D1.
 */
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import app from './index';
import { createHarness, type TestHarness } from './test/harness';

let h: TestHarness;
const env = () => ({ DB: h.d1 });

const req = (path: string, init?: RequestInit) =>
  app.fetch(new Request(`https://test.local${path}`, init), env());

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  req(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...headers },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.dispose();
});
beforeEach(async () => {
  await h.reset();
});

const R = (rupees: number) => Math.round(rupees * 100);

describe('dealer + transaction + ledger API', () => {
  it('creates a dealer, posts a sale, and reflects balances + ledger', async () => {
    const created = await post('/api/dealers', { name: 'Modern Metal Castings', type: 'both' });
    expect(created.status).toBe(201);
    const { dealer } = (await created.json()) as { dealer: { id: number } };

    const sale = await post('/api/transactions', {
      dealerId: dealer.id,
      date: '2026-06-02',
      mode: 'sale',
      taxType: 'intra',
      referenceTag: 'ASH 39',
      lines: [
        {
          itemName: 'Castings',
          quantity: 9510,
          actualRatePaise: R(33),
          currentRatePaise: R(24),
          gstRatePercent: 18,
        },
      ],
    });
    expect(sale.status).toBe(201);
    const saleBody = (await sale.json()) as {
      transaction: { humanId: string; actualBalancePaise: number };
    };
    expect(saleBody.transaction.humanId).toBe('SALE-2026-06-0001');
    expect(saleBody.transaction.actualBalancePaise).toBe(R(354913)); // ASH 39 debit (Scenario B)

    // Dealer detail balances
    const detail = await req(`/api/dealers/${dealer.id}`);
    const detailBody = (await detail.json()) as {
      balances: { actual: { state: string; balancePaise: number } };
    };
    expect(detailBody.balances.actual.state).toBe('owes_you');

    // Actual ledger has one entry, reading the STORED running balance
    const ledger = await req(`/api/dealers/${dealer.id}/ledger?account=actual`);
    const ledgerBody = (await ledger.json()) as {
      entries: unknown[];
      headline: { balancePaise: number };
    };
    expect(ledgerBody.entries.length).toBe(1);
    expect(ledgerBody.headline.balancePaise).toBe(saleBody.transaction.actualBalancePaise);

    // The dealer list shows the inline actual balance
    const list = await req('/api/dealers?activity=sale');
    const listBody = (await list.json()) as {
      dealers: { id: number; actualBalancePaise: number }[];
    };
    expect(listBody.dealers.find((d) => d.id === dealer.id)?.actualBalancePaise).toBe(
      saleBody.transaction.actualBalancePaise,
    );
  });

  it('seeds an opening balance on dealer create', async () => {
    const created = await post('/api/dealers', {
      name: 'Opener',
      type: 'buyer',
      openingActualPaise: -R(50000),
    });
    const { dealer } = (await created.json()) as { dealer: { id: number } };
    const detail = await req(`/api/dealers/${dealer.id}`);
    const body = (await detail.json()) as {
      balances: { actual: { state: string; magnitudePaise: number } };
    };
    expect(body.balances.actual).toMatchObject({ state: 'you_owe', magnitudePaise: R(50000) });
  });

  it('lists the correct inline actual balance per dealer (multi-dealer regression)', async () => {
    const a = await post('/api/dealers', {
      name: 'Alpha',
      type: 'both',
      openingActualPaise: R(30000),
    });
    const b = await post('/api/dealers', {
      name: 'Beta',
      type: 'both',
      openingActualPaise: -R(20000),
    });
    const aid = ((await a.json()) as { dealer: { id: number } }).dealer.id;
    const bid = ((await b.json()) as { dealer: { id: number } }).dealer.id;

    const list = await req('/api/dealers');
    const ds = ((await list.json()) as { dealers: { id: number; actualBalancePaise: number }[] })
      .dealers;
    expect(ds.find((d) => d.id === aid)?.actualBalancePaise).toBe(R(30000));
    expect(ds.find((d) => d.id === bid)?.actualBalancePaise).toBe(-R(20000));
  });

  it('rejects non-integer paise (float) with 400', async () => {
    const created = await post('/api/dealers', { name: 'D', type: 'both' });
    const { dealer } = (await created.json()) as { dealer: { id: number } };
    const res = await post('/api/movements', {
      dealerId: dealer.id,
      date: '2026-06-01',
      direction: 'received',
      amountPaise: 100.5,
      accountScope: 'actual',
    });
    expect(res.status).toBe(400);
    expect((await res.json()) as { error: string }).toMatchObject({ error: 'validation' });
  });

  it('rejects a future-dated transaction with 400', async () => {
    const created = await post('/api/dealers', { name: 'D', type: 'both' });
    const { dealer } = (await created.json()) as { dealer: { id: number } };
    const res = await post('/api/movements', {
      dealerId: dealer.id,
      date: '2999-01-01',
      direction: 'received',
      amountPaise: R(100),
      accountScope: 'actual',
    });
    expect(res.status).toBe(400);
  });

  it('blocks cross-site state-changing requests (CSRF backstop)', async () => {
    const res = await post('/api/dealers', { name: 'X' }, { 'sec-fetch-site': 'cross-site' });
    expect(res.status).toBe(403);
  });

  it('archived dealers are excluded from lists and reject new transactions', async () => {
    const created = await post('/api/dealers', { name: 'Gone', type: 'both' });
    const { dealer } = (await created.json()) as { dealer: { id: number } };
    await post(`/api/dealers/${dealer.id}/archive`, {});

    const list = await req('/api/dealers');
    const listBody = (await list.json()) as { dealers: { id: number }[] };
    expect(listBody.dealers.find((d) => d.id === dealer.id)).toBeUndefined();

    const txn = await post('/api/transactions', {
      dealerId: dealer.id,
      date: '2026-06-02',
      mode: 'sale',
      taxType: 'none',
      lines: [
        {
          itemName: 'x',
          quantity: 1,
          actualRatePaise: R(100),
          currentRatePaise: R(100),
          gstRatePercent: 0,
        },
      ],
    });
    expect(txn.status).toBe(400);
  });

  it('voids a movement: original marked voided, reversal present, balance neutralised', async () => {
    const created = await post('/api/dealers', { name: 'Voidy', type: 'both' });
    const { dealer } = (await created.json()) as { dealer: { id: number } };
    const m = await post('/api/movements', {
      dealerId: dealer.id,
      date: '2026-06-01',
      direction: 'received',
      amountPaise: R(1000),
      accountScope: 'actual',
    });
    const { movement } = (await m.json()) as { movement: { movementId: number } };

    const voided = await post(`/api/movements/${movement.movementId}/void`, {});
    expect(voided.status).toBe(200);

    const ledger = await req(`/api/dealers/${dealer.id}/ledger?account=actual`);
    const body = (await ledger.json()) as {
      headline: { balancePaise: number };
      entries: { isVoided: boolean; voidable: boolean; sourceType: string }[];
    };
    expect(body.headline.balancePaise).toBe(0); // neutralised by the reversal
    const original = body.entries.find((e) => e.sourceType === 'movement');
    expect(original).toMatchObject({ isVoided: true, voidable: false });
    expect(body.entries.some((e) => e.sourceType === 'adjustment')).toBe(true);
  });

  it('transaction detail exposes the CGST/SGST split summing to total GST + round-off', async () => {
    const created = await post('/api/dealers', { name: 'GST', type: 'both' });
    const { dealer } = (await created.json()) as { dealer: { id: number } };
    const sale = await post('/api/transactions', {
      dealerId: dealer.id,
      date: '2026-06-02',
      mode: 'sale',
      taxType: 'intra',
      lines: [
        {
          itemName: 'Castings',
          quantity: 9510,
          actualRatePaise: R(33),
          currentRatePaise: R(24),
          gstRatePercent: 18,
        },
      ],
    });
    const { transaction } = (await sale.json()) as { transaction: { transactionId: number } };

    const detail = await req(`/api/transactions/${transaction.transactionId}`);
    const body = (await detail.json()) as {
      transaction: {
        taxType: string;
        totals: {
          cgstPaise: number;
          sgstPaise: number;
          gstPaise: number;
          igstPaise: number;
          roundOffPaise: number;
          currentPostedPaise: number;
        };
      };
    };
    const t = body.transaction.totals;
    expect(body.transaction.taxType).toBe('intra');
    expect(t.cgstPaise).toBe(2054160); // ₹20,541.60 each
    expect(t.sgstPaise).toBe(2054160);
    expect(t.cgstPaise + t.sgstPaise).toBe(t.gstPaise);
    expect(t.igstPaise).toBe(0);
    expect(t.roundOffPaise).toBe(-20);
    expect(t.currentPostedPaise).toBe(R(269323));
  });
});
