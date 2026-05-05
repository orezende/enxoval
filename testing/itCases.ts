import { it } from 'vitest';
import type { Schema } from '@enxoval/types';
import { generate } from './generate';

type TestFn<T> = (input: T) => void | Promise<void>;

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
export function itCases<T>(
  description: string,
  schema: Schema<T>,
  fnOrOverrides: TestFn<T> | Partial<Record<string, unknown>>,
  maybeFn?: TestFn<T>,
): void {
  const overrides = typeof fnOrOverrides === 'function' ? undefined : fnOrOverrides;
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
