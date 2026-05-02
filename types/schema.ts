import type { UUID } from './uuid';
import { UUID_REGEX } from './uuid';

export type FieldDescriptor =
  | { type: 'string' | 'uuid' | 'boolean' | 'number' | 'date' }
  | { type: 'literal'; values: string[] }
  | { type: 'nullable'; inner: FieldDescriptor }
  | { type: 'nested' }
  | { type: 'array' };

export type FieldParser<T> = {
  (value: unknown, field: string): T;
  _type: string;
  _values?: string[];
};

type InferFields<F extends Record<string, FieldParser<unknown>>> = {
  [K in keyof F]: F[K] extends FieldParser<infer T> ? T : never;
};

export type Schema<T> = {
  parse(data: unknown): T;
  describe?(): Record<string, FieldDescriptor>;
};

function makeParser<T>(fn: (value: unknown, field: string) => T, type: string, values?: string[]): FieldParser<T> {
  const parser = fn as FieldParser<T>;
  parser._type = type;
  if (values) parser._values = values;
  return parser;
}

export function createSchema<F extends Record<string, FieldParser<unknown>>>(
  fields: F,
): Schema<InferFields<F>> {
  return {
    parse(data: unknown): InferFields<F> {
      if (typeof data !== 'object' || data === null) {
        throw new TypeError(`Expected object, got ${typeof data}`);
      }
      const obj = data as Record<string, unknown>;
      const result = {} as InferFields<F>;
      for (const key of Object.keys(fields) as (keyof F)[]) {
        (result as Record<string, unknown>)[key as string] = fields[key](
          obj[key as string],
          key as string,
        );
      }
      return result;
    },

    describe(): Record<string, FieldDescriptor> {
      const result: Record<string, FieldDescriptor> = {};
      for (const key of Object.keys(fields)) {
        const f = fields[key];
        if (f._type === 'literal') {
          result[key] = { type: 'literal', values: f._values ?? [] };
        } else {
          result[key] = { type: f._type } as FieldDescriptor;
        }
      }
      return result;
    },
  };
}

export const field = {
  uuid(): FieldParser<UUID> {
    return makeParser((value, name) => {
      if (typeof value !== 'string') {
        throw new TypeError(`Field "${name}" must be a UUID string, got ${typeof value}`);
      }
      if (!UUID_REGEX.test(value)) {
        throw new TypeError(`Field "${name}" is not a valid UUID: "${value}"`);
      }
      return value as UUID;
    }, 'uuid');
  },

  string(): FieldParser<string> {
    return makeParser((value, name) => {
      if (typeof value !== 'string') {
        throw new TypeError(`Field "${name}" must be a string, got ${typeof value}`);
      }
      return value;
    }, 'string');
  },

  date(): FieldParser<Date> {
    return makeParser((value, name) => {
      if (value instanceof Date) return value;
      if (typeof value === 'string' || typeof value === 'number') {
        const d = new Date(value);
        if (!isNaN(d.getTime())) return d;
      }
      throw new TypeError(`Field "${name}" must be a Date or ISO string`);
    }, 'date');
  },

  literal<T extends string>(...allowed: T[]): FieldParser<T> {
    return makeParser((value, name) => {
      if (!allowed.includes(value as T)) {
        throw new TypeError(
          `Field "${name}" must be one of [${allowed.join(', ')}], got "${value}"`,
        );
      }
      return value as T;
    }, 'literal', allowed);
  },

  number(): FieldParser<number> {
    return makeParser((value, name) => {
      if (typeof value !== 'number' || isNaN(value)) {
        throw new TypeError(`Field "${name}" must be a number, got ${typeof value}`);
      }
      return value;
    }, 'number');
  },

  boolean(): FieldParser<boolean> {
    return makeParser((value, name) => {
      if (typeof value !== 'boolean') {
        throw new TypeError(`Field "${name}" must be a boolean, got ${typeof value}`);
      }
      return value;
    }, 'boolean');
  },

  nullable<T>(parser: FieldParser<T>): FieldParser<T | null> {
    return makeParser((value, name) => {
      if (value === null || value === undefined) return null;
      return parser(value, name);
    }, 'nullable');
  },

  nested<T>(schema: Schema<T>): FieldParser<T> {
    return makeParser((value, name) => {
      try {
        return schema.parse(value);
      } catch (err) {
        throw new TypeError(`Field "${name}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }, 'nested');
  },

  array<T>(schema: Schema<T>): Schema<T[]> {
    return {
      parse(data: unknown): T[] {
        if (!Array.isArray(data)) {
          throw new TypeError(`Expected array, got ${typeof data}`);
        }
        return data.map((item, i) => {
          try {
            return schema.parse(item);
          } catch (err) {
            throw new TypeError(`Item [${i}]: ${err instanceof Error ? err.message : String(err)}`);
          }
        });
      },
    };
  },
};
