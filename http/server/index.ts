/**
 * server/index.ts
 *
 * Fastify HTTP server wrapper for @enxoval/http.
 * Exposes helpers (get, post, put, patch, del, html, sseRoute, etc.) that
 * register routes on a shared Fastify instance and track them in
 * `registeredRoutes` for introspection via GET /routes.
 *
 * Internal framework routes (/contracts, /routes) are excluded from
 * the registry and silenced in request/response logs.
 * Note: /health must be registered by each consumer service individually.
 */
import Fastify, { type FastifyRequest, type FastifyReply, type HookHandlerDoneFunction, type LightMyRequestResponse } from 'fastify';
import cors from '@fastify/cors';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { logger } from '@enxoval/observability';
import { AppError } from '@enxoval/types';
import { newCid, nextCid } from '@enxoval/observability';

const app = Fastify({ logger: false });

app.register(cors, { origin: true });

app.decorateRequest('cid', '');
app.decorateRequest('startTime', 0);

/** Paths that are suppressed from request/response logs. */
const SILENT_PATHS = new Set(['/contracts', '/routes']);

/**
 * Registry of all routes registered via the exported helpers.
 * Populated by get(), post(), etc. — never includes /health, /contracts, /routes.
 */
const registeredRoutes: { method: string; path: string }[] = [];

app.addHook('onRequest', (request, reply, done) => {
  const incoming = request.headers['x-cid'] as string | undefined;
  const cid = incoming ? nextCid(incoming) : newCid();
  request.cid = cid;
  request.startTime = Date.now();
  reply.header('x-cid', cid);
  if (!SILENT_PATHS.has(request.url) && request.method !== 'OPTIONS') {
    logger.info({ cid, method: request.method, url: request.url }, 'http-server: request received');
  }
  done();
});

app.addHook('onResponse', (request, reply, done) => {
  if (!SILENT_PATHS.has(request.url) && request.method !== 'OPTIONS') {
    const durationMs = Date.now() - request.startTime;
    logger.info({ cid: request.cid, method: request.method, url: request.url, status: reply.statusCode, durationMs }, 'http-server: response sent');
  }
  done();
});

const HTTP_STATUS: Record<string, number> = {
  NotFoundError: 404,
  ConflictError: 409,
  ValidationError: 400,
  UnprocessableError: 422,
  UnauthorizedError: 401,
};

app.setErrorHandler((error, request, reply) => {
  if (error instanceof AppError) {
    const statusCode = HTTP_STATUS[error.name] ?? 500;
    logger.warn({ cid: request.cid, method: request.method, url: request.url, statusCode, error: error.name, message: error.message }, 'http-server: request error');
    reply.status(statusCode).send({ error: error.name, message: error.message });
    return;
  }
  if (error instanceof TypeError) {
    logger.warn({ cid: request.cid, method: request.method, url: request.url, message: error.message }, 'http-server: validation error');
    reply.status(400).send({ error: 'ValidationError', message: error.message });
    return;
  }
  logger.error({ cid: request.cid, method: request.method, url: request.url, error: error instanceof Error ? error.message : String(error) }, 'http-server: unexpected error');
  reply.status(500).send({ error: 'InternalServerError', message: 'Internal server error' });
});

type Handler<TBody = unknown> = (body: TBody) => Promise<unknown>;

/**
 * Registers a GET route and tracks it in registeredRoutes.
 * @param path - The URL path (e.g. '/users')
 * @param handler - Async function returning the response body
 */
export function get(path: string, handler: () => Promise<unknown>): void {
  registeredRoutes.push({ method: 'GET', path });
  app.get(path, async () => handler());
}

/**
 * Registers a GET route with typed URL params and tracks it in registeredRoutes.
 * @param path - The URL path with param placeholders (e.g. '/users/:id')
 * @param handler - Async function receiving typed params and returning the response body
 */
export function getWith<TParams>(path: string, handler: (params: TParams) => Promise<unknown>): void {
  registeredRoutes.push({ method: 'GET', path });
  app.get<{ Params: TParams }>(path, async (request) => handler(request.params as TParams));
}

/**
 * Registers a GET route that receives the Authorization header and tracks it in registeredRoutes.
 * @param path - The URL path
 * @param handler - Async function receiving the authorization string and returning the response body
 */
export function getWithAuth(path: string, handler: (authorization: string | undefined) => Promise<unknown>): void {
  registeredRoutes.push({ method: 'GET', path });
  app.get(path, async (request) => handler(request.headers['authorization'] as string | undefined));
}

/**
 * Registers a GET route that returns an HTML response and tracks it in registeredRoutes.
 * @param path - The URL path
 * @param handler - Async function returning an HTML string
 */
export function html(path: string, handler: () => Promise<string>): void {
  registeredRoutes.push({ method: 'GET', path });
  app.get(path, async (_request, reply) => {
    reply.type('text/html; charset=utf-8').send(await handler());
  });
}

/**
 * Registers a POST route returning 201 and tracks it in registeredRoutes.
 * @param path - The URL path
 * @param handler - Async function receiving the typed body and returning the response body
 */
export function post<TBody>(path: string, handler: Handler<TBody>): void {
  registeredRoutes.push({ method: 'POST', path });
  app.post<{ Body: TBody }>(path, async (request, reply) => {
    reply.status(201).send(await handler(request.body as TBody));
  });
}

/**
 * Registers a POST route returning 200 and tracks it in registeredRoutes.
 * @param path - The URL path
 * @param handler - Async function receiving the typed body and returning the response body
 */
export function postOk<TBody>(path: string, handler: Handler<TBody>): void {
  registeredRoutes.push({ method: 'POST', path });
  app.post<{ Body: TBody }>(path, async (request, reply) => {
    reply.status(200).send(await handler(request.body as TBody));
  });
}

/**
 * Registers a PUT route returning 200 and tracks it in registeredRoutes.
 * @param path - The URL path
 * @param handler - Async function receiving the typed body and returning the response body
 */
export function put<TBody>(path: string, handler: Handler<TBody>): void {
  registeredRoutes.push({ method: 'PUT', path });
  app.put<{ Body: TBody }>(path, async (request, reply) => {
    reply.status(200).send(await handler(request.body as TBody));
  });
}

/**
 * Registers a PATCH route returning 200 and tracks it in registeredRoutes.
 * @param path - The URL path
 * @param handler - Async function receiving the typed body and returning the response body
 */
export function patch<TBody>(path: string, handler: Handler<TBody>): void {
  registeredRoutes.push({ method: 'PATCH', path });
  app.patch<{ Body: TBody }>(path, async (request, reply) => {
    reply.status(200).send(await handler(request.body as TBody));
  });
}

/**
 * Registers a DELETE route returning 204 and tracks it in registeredRoutes.
 * @param path - The URL path
 * @param handler - Async function called on deletion
 */
export function del(path: string, handler: () => Promise<unknown>): void {
  registeredRoutes.push({ method: 'DELETE', path });
  app.delete(path, async (_request, reply) => {
    reply.status(204).send(await handler());
  });
}

// Internal framework routes — not tracked in registeredRoutes

app.get('/contracts', async () => {
  const contractsPath = resolve(process.cwd(), 'dist', 'contracts.json');
  return JSON.parse(readFileSync(contractsPath, 'utf-8'));
});

/** Returns all routes registered via the exported helpers. Internal routes are excluded. */
app.get('/routes', async () => registeredRoutes);

export async function listen(port: number, host: string, setup?: () => Promise<void>): Promise<void> {
  if (!process.env.CI && setup) await setup();
  await app.listen({ port, host });
}

export async function close(): Promise<void> {
  await app.close();
}

export function addPreHandler(fn: (request: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) => void): void {
  app.addHook('preHandler', fn);
}

/**
 * Injects a request directly into the Fastify instance (useful for testing).
 * @param options - Method, URL, optional body and headers
 * @returns The LightMyRequest response
 */
export async function inject(options: {
  method: string;
  url: string;
  body?: unknown;
  headers?: Record<string, string>;
}): Promise<LightMyRequestResponse> {
  return app.inject({
    method: options.method as 'POST' | 'GET' | 'PUT' | 'PATCH' | 'DELETE',
    url: options.url,
    payload: options.body as string | object | undefined,
    headers: options.headers,
  }) as Promise<LightMyRequestResponse>;
}

/**
 * Registers a Server-Sent Events (SSE) route and tracks it in registeredRoutes.
 * @param path - The URL path (may include params)
 * @param handler - Async function receiving params, query, a send helper, and an AbortSignal
 */
export function sseRoute<TParams, TQuery = Record<string, string>>(
  path: string,
  handler: (
    params: TParams,
    query: TQuery,
    send: (data: object) => void,
    signal: AbortSignal,
  ) => Promise<void>,
): void {
  registeredRoutes.push({ method: 'SSE', path });
  app.get<{ Params: TParams; Querystring: TQuery }>(path, async (request, reply) => {
    reply.hijack();
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');
    reply.raw.flushHeaders();

    const controller = new AbortController();
    const onClose = () => controller.abort();
    request.raw.on('close', onClose);

    const send = (data: object) => {
      if (!reply.raw.destroyed) {
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      }
    };

    try {
      await handler(request.params as TParams, request.query as TQuery, send, controller.signal);
    } finally {
      request.raw.off('close', onClose);
      if (!reply.raw.destroyed) reply.raw.end();
    }
  });
}
