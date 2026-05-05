/**
 * itCases.ts — Property-based test runner for @enxoval/testing.
 *
 * Provides `itCases()`, a drop-in replacement for vitest's `it()` that generates
 * N random inputs (50–150) from a schema using `generate()`, runs the user's fn
 * on every input without early exit, and throws a consolidated error listing all
 * failures if any occur. Supports an optional overrides map to pin specific fields.
 */

import { it } from 'vitest';
import type { Schema } from '@enxoval/types';
import { generate } from './generate';

type TestFn<T> = (input: T) => void | Promise<void>;

/** Returns a random integer in [50, 150] used as the iteration count per test run. */
function randomN(): number {
  return Math.floor(Math.random() * 101) + 50;
}

export function itCases<T>(description: string, schema: Schema<T>, fn: TestFn<T>): void;
export function itCases<T>(
  description: string,
  schema: Schema<T>,
  overrides: Partial<Record<string, unknown>>,
  fn: TestFn<T>,
): void;
/**
 * Property-based vitest test that generates N random inputs from `schema` and
 * asserts `fn` does not throw for any of them. All failures are collected and
 * reported together in a single consolidated error message.
 *
 * @param description - The test name (same as vitest's `it()` first argument).
 * @param schema      - The schema used to generate random inputs.
 * @param overrides   - Optional fixed values for specific fields (passed to generate()).
 * @param fn          - The assertion function. Receives one generated input per call.
 */
export function itCases<T>(
  description: string,
  schema: Schema<T>,
  fnOrOverrides: TestFn<T> | Partial<Record<string, unknown>>,
  maybeFn?: TestFn<T>,
): void {
  const overrides = typeof fnOrOverrides === 'function' ? undefined : fnOrOverrides;
  // Cast needed because TypeScript cannot narrow the union to TestFn<T> after the typeof check
  const fn = (typeof fnOrOverrides === 'function' ? fnOrOverrides : maybeFn) as TestFn<T>;

  it(description, async () => {
    const n = randomN();
    const failures: Array<{ index: number; input: T; error: string }> = [];

    for (let i = 0; i < n; i++) {
      const input = generate(schema, overrides);
      try {
        await fn(input);
      } catch (err) {
        failures.push({
          index: i,
          input,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (failures.length > 0) {
      const lines = failures.map(
        (f) => `  [${f.index}] ${JSON.stringify(f.input)} → ${f.error}`,
      );
      throw new Error(`${failures.length}/${n} casos falharam:\n${lines.join('\n')}`);
    }
  });
}
