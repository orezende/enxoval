import { describe, it, expect } from 'vitest';
import { createSchema, field } from '@enxoval/types';
import { generate } from '../../generate';

const UserSchema = createSchema({
  id: field.uuid(),
  name: field.string(),
  age: field.number(),
  active: field.boolean(),
  role: field.literal('admin', 'student'),
  createdAt: field.date(),
});

describe('generate', () => {
  it('produces a value that passes schema.parse()', () => {
    const result = generate(UserSchema);
    expect(() => UserSchema.parse(result)).not.toThrow();
  });

  it('generates correct types for each field', () => {
    const result = generate(UserSchema);
    expect(typeof result.name).toBe('string');
    expect(typeof result.age).toBe('number');
    expect(typeof result.active).toBe('boolean');
    expect(['admin', 'student']).toContain(result.role);
  });

  it('applies overrides', () => {
    const result = generate(UserSchema, { name: 'Alice', age: 30 });
    expect(result.name).toBe('Alice');
    expect(result.age).toBe(30);
  });

  it('nullable field returns null or a value', () => {
    const Schema = createSchema({ value: field.nullable(field.string()) });
    const results = Array.from({ length: 20 }, () => generate(Schema));
    const hasNull = results.some((r) => r.value === null);
    const hasValue = results.some((r) => r.value !== null);
    expect(hasNull && hasValue).toBe(true);
  });

  it('nested schema generates recursively', () => {
    const AddressSchema = createSchema({ city: field.string() });
    const PersonSchema = createSchema({ address: field.nested(AddressSchema) });
    const result = generate(PersonSchema);
    expect(typeof result.address.city).toBe('string');
  });
});
