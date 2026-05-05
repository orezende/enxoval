import { vi } from 'vitest';

export { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
export { createTestDataSource } from '@enxoval/db';

export const test = {
  fn: vi.fn,
  mock: vi.mock,
  spy: vi.spyOn,
  clearAll: vi.clearAllMocks,
};

export { generate } from './generate.js';
export { itCases } from './itCases.js';
