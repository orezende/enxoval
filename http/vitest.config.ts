/**
 * vitest.config.ts
 *
 * Vitest configuration for @enxoval/http.
 * Explicitly includes only TypeScript source test files to prevent
 * vitest from picking up compiled output in the dist/ directory.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
  },
});
