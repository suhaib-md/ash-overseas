import { defineConfig } from 'vitest/config';

// Phase 0: pure unit tests for the money/ledger core (no DB, no workerd) — fast.
// Phase 1 adds a second Vitest project using @cloudflare/vitest-pool-workers for
// D1-backed integration tests against the real posting path.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['shared/**/*.test.ts'],
  },
});
