import { describe, it, expect } from 'vitest';
import { createSchema, field } from '@enxoval/types';
import { itCases } from '../../itCases';

const NumberSchema = createSchema({ value: field.number() });

describe('itCases', () => {
  itCases('passes when fn never throws', NumberSchema, (input) => {
    expect(typeof input.value).toBe('number');
  });

  itCases('passes with overrides applied', NumberSchema, { value: 42 }, (input) => {
    expect(input.value).toBe(42);
  });
});
