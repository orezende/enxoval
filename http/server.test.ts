/**
 * server.test.ts
 *
 * Tests for the GET /routes endpoint in @enxoval/http.
 * Verifies that registered routes are correctly tracked and exposed,
 * while internal framework routes (/health, /contracts, /routes) are excluded.
 */
import { describe, it, expect } from 'vitest';
import { get, post, del, sseRoute, inject } from './index';

// Registra rotas de teste (o módulo tem estado global)
get('/test-get', async () => ({ ok: true }));
post('/test-post', async () => ({ ok: true }));
del('/test-del', async () => ({ ok: true }));
sseRoute('/test-sse', async () => {});

describe('GET /routes', () => {
  it('retorna 200 com array de rotas registradas', async () => {
    const res = await inject({ method: 'GET', url: '/routes' });
    expect(res.statusCode).toBe(200);
    const routes = JSON.parse(res.body) as { method: string; path: string }[];
    expect(Array.isArray(routes)).toBe(true);
  });

  it('inclui rotas registradas com método correto', async () => {
    const res = await inject({ method: 'GET', url: '/routes' });
    const routes = JSON.parse(res.body) as { method: string; path: string }[];
    expect(routes).toContainEqual({ method: 'GET', path: '/test-get' });
    expect(routes).toContainEqual({ method: 'POST', path: '/test-post' });
    expect(routes).toContainEqual({ method: 'DELETE', path: '/test-del' });
    expect(routes).toContainEqual({ method: 'SSE', path: '/test-sse' });
  });

  it('não inclui rotas internas do framework', async () => {
    const res = await inject({ method: 'GET', url: '/routes' });
    const paths = (JSON.parse(res.body) as { method: string; path: string }[]).map((r) => r.path);
    expect(paths).not.toContain('/health');
    expect(paths).not.toContain('/contracts');
    expect(paths).not.toContain('/routes');
  });
});
