/**
 * generate.ts — Random value factory for @enxoval/types schemas.
 *
 * Provides a `generate()` function that introspects a Schema's `_fields` metadata
 * and produces a random valid value for each field. Supports all built-in field types:
 * string, uuid, number, boolean, date, literal, nullable, and nested schemas.
 *
 * Optionally accepts an `overrides` map to pin specific fields to fixed values,
 * which is useful for writing readable, deterministic test assertions.
 */

import type { Schema, FieldParser } from '@enxoval/types';

/**
 * Generates a random string of 8 alphanumeric characters.
 * Used as the default value for `field.string()` fields.
 */
function randomString(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Generates a random ISO 8601 date string within the last 30 days.
 * Returned as a string so it can be parsed by `field.date()` (which accepts ISO strings).
 */
function randomDate(): string {
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  return new Date(now - Math.random() * thirtyDays).toISOString();
}

/**
 * Generates a random value for a single FieldParser based on its `_type` metadata.
 *
 * @param parser - The FieldParser whose `_type` determines the generated value.
 * @returns A random value compatible with the parser's expected type.
 */
function generateFromParser(parser: FieldParser<unknown>): unknown {
  switch (parser._type) {
    case 'string':
      return randomString();

    case 'uuid':
      return crypto.randomUUID();

    case 'number':
      return Math.floor(Math.random() * 1000);

    case 'boolean':
      return Math.random() > 0.5;

    case 'date':
      return randomDate();

    case 'literal': {
      const values = parser._values ?? [];
      return values[Math.floor(Math.random() * values.length)];
    }

    case 'nullable':
      // 50% chance of returning null, otherwise delegate to the inner parser
      return Math.random() > 0.5 ? null : generateFromParser(parser._inner!);

    case 'nested':
      // Recursively generate a value from the nested schema
      return generate(parser._schema!);

    default:
      return null;
  }
}

/**
 * Generates a random object that satisfies the given schema.
 *
 * Introspects the schema's `_fields` metadata to determine the type of each field
 * and produces a random valid value. The result is passed through `schema.parse()`
 * to guarantee validity (including UUID format checks, etc.).
 *
 * @param schema   - The schema to generate a value for.
 * @param overrides - Optional map of field names to fixed values. Overrides are
 *                   applied before `schema.parse()`, so they must be valid for
 *                   their respective fields.
 * @returns A fully valid object of type T.
 */
export function generate<T>(schema: Schema<T>, overrides?: Partial<Record<string, unknown>>): T {
  const fields = schema._fields ?? {};
  const raw: Record<string, unknown> = {};

  for (const [key, parser] of Object.entries(fields)) {
    raw[key] = generateFromParser(parser);
  }

  if (overrides) {
    Object.assign(raw, overrides);
  }

  return schema.parse(raw);
}
