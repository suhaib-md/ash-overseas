import { defineConfig } from 'vitest/config';

// D1-backed integration tests for the posting layer. These drive a real local D1
// via Miniflare (see worker/ledger/post.test.ts) in a plain Node environment.
// Run with `pnpm test:d1`. Fast unit tests live in vitest.config.ts.
export default defineConfig({
  test: {
    include: ['worker/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
