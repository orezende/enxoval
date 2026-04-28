import { defineConfig } from 'vitest/config';
import { join } from 'node:path';

const setupFile = join(__dirname, 'dist', 'setup.js');

function testAliasPlugin() {
  return {
    name: 'test-alias',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      if (!id.endsWith('.test.ts') && !id.endsWith('.test.js')) return null;
      return {
        code: code
          .replace(/\btest\.mock\(/g, 'vi.mock(')
          .replace(/\btest\.fn\b/g, 'vi.fn')
          .replace(/\btest\.spy\b/g, 'vi.spyOn')
          .replace(/\btest\.clearAll\b/g, 'vi.clearAllMocks'),
        map: null,
      };
    },
  };
}

export default defineConfig({
  test: {
    globals: true,
    root: process.cwd(),
    projects: [
      {
        plugins: [testAliasPlugin()],
        test: {
          name: 'unit',
          globals: true,
          setupFiles: [setupFile],
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        plugins: [testAliasPlugin()],
        test: {
          name: 'integration',
          globals: true,
          setupFiles: [setupFile],
          include: ['tests/integration/**/*.test.ts'],
          pool: 'forks',
          env: { LOG_LEVEL: 'silent' },
        },
      },
    ],
  },
});
