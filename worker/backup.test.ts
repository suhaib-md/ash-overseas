import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createHarness, type TestHarness } from './test/harness';
import { dealers } from './db/schema';
import { runBackup } from './backup';

let h: TestHarness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.dispose();
});
beforeEach(async () => {
  await h.reset();
});

describe('backup', () => {
  it('dumps all tables to a SQL file in R2 (with proper escaping)', async () => {
    await h.db.insert(dealers).values({ name: "O'Brien Metals", type: 'both' });

    const key = await runBackup({ DB: h.d1, BACKUPS: h.r2 });
    expect(key).toMatch(/^backups\/.*\.sql$/);

    const obj = await h.r2.get(key);
    const text = await obj!.text();
    expect(text).toContain('INSERT INTO dealers');
    expect(text).toContain("O''Brien Metals"); // single quote escaped for SQL
  });
});
