/**
 * client/index.ts
 *
 * Transparent HTTP client for dune-lab inter-service calls.
 *
 * Exports:
 *   tokenStorage   — AsyncLocalStorage<string> set by @enxoval/auth for HTTP flows
 *   defineHttpAliases(schemas) — reads ${SERVICE_NAME}.json, validates aliases,
 *                                returns a typed call() function
 *
 * call(alias, opts?) resolves:
 *   - URL from ${SERVICE.toUpperCase()}_URL env var
 *   - path params from payload (e.g. :userId → payload.userId)
 *   - GET/DELETE → remaining payload becomes query string
 *   - POST/PUT/PATCH → remaining payload becomes JSON body
 *   - auth: Bearer token from tokenStorage, or X-Service-Token for Kafka flows
 *   - errors: HTTP status codes mapped to AppError subclasses
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  UnprocessableError,
  UnauthorizedError,
} from '@enxoval/types';

/** AsyncLocalStorage used to propagate Bearer tokens across async contexts.
 * Set by @enxoval/auth middleware; read by call() to inject Authorization header.
 */
export const tokenStorage = new AsyncLocalStorage<string>();

/** Shape of a single HTTP route entry from the JSON config file. */
type HttpRoute = {
  service: string;
  method: string;
  path: string;
  auth?: boolean;
  nullable?: boolean;
};

/** The parsed http section of ${SERVICE_NAME}.json */
type HttpConfig = Record<string, HttpRoute>;

/** Any schema with a parse() method (compatible with zod, @enxoval/types, etc.) */
type AnySchema = { parse(data: unknown): unknown };

/** Infers the output type of a schema's parse() method. */
type InferOutput<S> = S extends { parse(data: unknown): infer T } ? T : never;

/** Options passed to call(). */
type CallOpts = {
  payload?: Record<string, unknown>;
  headers?: Record<string, string>;
};

/**
 * Reads and parses the http section from ${SERVICE_NAME}.json in cwd.
 * Throws if SERVICE_NAME env var is not set.
 *
 * @returns The http config map (alias → route definition)
 */
function readHttpConfig(): HttpConfig {
  const serviceName = process.env.SERVICE_NAME;
  if (!serviceName) throw new Error('Missing env var: SERVICE_NAME');
  const configPath = resolve(process.cwd(), `${serviceName}.json`);
  const raw = JSON.parse(readFileSync(configPath, 'utf-8')) as { http?: HttpConfig };
  return raw.http ?? {};
}

/**
 * Executes the actual HTTP request for a given alias.
 *
 * @param alias   - The route alias key (must exist in config)
 * @param opts    - Optional payload and extra headers
 * @param config  - The full http config loaded from JSON
 * @param schemas - Schema map used to validate and parse the response
 * @returns       - Parsed response data, or null for nullable 404s
 */
async function executeCall(
  alias: string,
  opts: CallOpts | undefined,
  config: HttpConfig,
  schemas: Record<string, AnySchema>,
): Promise<unknown> {
  const route = config[alias];

  const baseUrl = process.env[`${route.service.toUpperCase()}_URL`];
  if (!baseUrl) throw new Error(`Missing env var: ${route.service.toUpperCase()}_URL`);

  const payload = opts?.payload ?? {};
  let path = route.path;
  const remaining: Record<string, unknown> = {};

  // Substitute path params (e.g. :userId → payload.userId), collect remaining fields
  // Uses word-boundary regex to avoid substring collisions (e.g. :user vs :userId)
  for (const [key, value] of Object.entries(payload)) {
    const paramRegex = new RegExp(`:${key}(?![a-zA-Z0-9_])`);
    if (paramRegex.test(path)) {
      path = path.replace(paramRegex, String(value));
    } else {
      remaining[key] = value;
    }
  }

  // Guard: if any :param remains, the caller forgot to provide it
  if (path.includes(':')) {
    const unresolved = path.match(/:([a-zA-Z_]+)/g)?.join(', ');
    throw new Error(`Missing path params for alias "${alias}": ${unresolved}`);
  }

  let url = `${baseUrl}${path}`;
  const headers: Record<string, string> = { ...(opts?.headers ?? {}) };
  const isBodyMethod = ['POST', 'PUT', 'PATCH'].includes(route.method);

  // For GET/DELETE: append remaining payload fields as query string
  if (!isBodyMethod && Object.keys(remaining).length > 0) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(remaining).map(([k, v]) => [k, String(v)])),
    );
    url += `?${qs}`;
  }

  // Auth injection: Bearer token from tokenStorage, or X-Service-Token for Kafka flows
  if (route.auth !== false) {
    const token = tokenStorage.getStore();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else {
      const secret = process.env.JWT_SECRET;
      if (!secret) throw new Error('Missing env var: JWT_SECRET');
      headers['X-Service-Token'] = secret;
    }
  }

  const fetchOpts: RequestInit = { method: route.method, headers };

  // For POST/PUT/PATCH: remaining payload fields become JSON body
  if (isBodyMethod && Object.keys(remaining).length > 0) {
    headers['Content-Type'] = 'application/json';
    fetchOpts.body = JSON.stringify(remaining);
  }

  const res = await fetch(url, fetchOpts);

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    const msg = body.message;

    if (res.status === 401) throw new UnauthorizedError(msg ?? 'Unauthorized');
    if (res.status === 404) {
      if (route.nullable) return null;
      throw new NotFoundError(msg ?? 'Not found');
    }
    if (res.status === 409) throw new ConflictError(msg ?? 'Conflict');
    if (res.status === 422) throw new UnprocessableError(msg ?? 'Unprocessable');
    if (res.status === 400) throw new ValidationError(msg ?? 'Bad request');
    throw new Error(msg ?? `HTTP ${res.status}`);
  }

  const data = await res.json();
  return schemas[alias].parse(data);
}

/**
 * Reads ${SERVICE_NAME}.json from cwd, validates that every alias in schemas
 * exists in the JSON's http section, and returns a typed { call } function.
 *
 * @param schemas - Map of alias → schema (any object with a parse() method)
 * @returns       - { call } where call(alias, opts?) returns a typed Promise
 * @throws        - If any alias is missing from the JSON http section
 */
export function defineHttpAliases<T extends Record<string, AnySchema>>(
  schemas: T,
): {
  call: <K extends keyof T & string>(alias: K, opts?: CallOpts) => Promise<InferOutput<T[K]>>;
} {
  const config = readHttpConfig();

  for (const alias of Object.keys(schemas)) {
    if (!config[alias]) {
      throw new Error(
        `defineHttpAliases: alias "${alias}" is not declared in ${process.env.SERVICE_NAME}.json http section`,
      );
    }
  }

  return {
    call: <K extends keyof T & string>(alias: K, opts?: CallOpts) =>
      executeCall(alias, opts, config, schemas as Record<string, AnySchema>) as Promise<InferOutput<T[K]>>,
  };
}
