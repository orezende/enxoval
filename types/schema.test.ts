/**
 * schema.test.ts
 * Tests for FieldParser and Schema metadata introspection.
 * Verifies that _inner, _schema and _fields are correctly stored for use
 * by the @enxoval/testing generate() introspection engine.
 */
import { describe, it, expect } from 'vitest';
import { createSchema, field } from './schema';

describe('FieldParser metadata', () => {
  it('field.nullable stores _inner parser', () => {
    const inner = field.string();
    const parser = field.nullable(inner);
    expect(parser._type).toBe('nullable');
    expect(parser._inner).toBe(inner);
  });

  it('field.nested stores _schema', () => {
    const inner = createSchema({ x: field.number() });
    const parser = field.nested(inner);
    expect(parser._type).toBe('nested');
    expect(parser._schema).toBe(inner);
  });

  it('createSchema exposes _fields', () => {
    const nameParser = field.string();
    const schema = createSchema({ name: nameParser });
    expect(schema._fields).toBeDefined();
    expect(schema._fields!['name']).toBe(nameParser);
  });
});
