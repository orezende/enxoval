/**
 * server.test.ts
 *
 * Tests for the GET /routes endpoint in @enxoval/http.
 * Verifies that registered routes expose contract metadata (in/out schemas),
 * while internal framework routes (/contracts, /routes) are excluded.
 */
import { describe, it, expect } from 'vitest';
import { createSchema, field } from '@enxoval/types';
import { get, post, del, sseRoute, inject } from './index';

const TestIn  = createSchema({ id: field.uuid() });
const TestOut = createSchema({ ok: field.boolean() });

get('/test-get',           async () => ({ ok: true }), { in: null, out: null });
post('/test-post',         async () => ({ ok: true }), { in: null, out: null });
del('/test-del',           async () => ({ ok: true }), { in: null, out: null });
sseRoute('/test-sse',      async () => {},              { in: null, out: null });
get('/test-with-contract', async () => ({ ok: true }), {
  in:  { schema: TestIn,  name: 'TestIn'  },
  out: { schema: TestOut, name: 'TestOut' },
});

describe('GET /routes', () => {
  it('retorna 200 com array de rotas registradas', async () => {
    const res = await inject({ method: 'GET', url: '/routes' });
    expect(res.statusCode).toBe(200);
    const routes = JSON.parse(res.body) as unknown[];
    expect(Array.isArray(routes)).toBe(true);
  });

  it('inclui campo contract em cada rota', async () => {
    const res = await inject({ method: 'GET', url: '/routes' });
    const routes = JSON.parse(res.body) as { contract: unknown }[];
    expect(routes.every(r => 'contract' in r)).toBe(true);
  });

  it('contract é {in:null,out:null} para rotas sem schema', async () => {
    const res = await inject({ method: 'GET', url: '/routes' });
    const routes = JSON.parse(res.body) as { path: string; contract: { in: unknown; out: unknown } }[];
    const r = routes.find(r => r.path === '/test-get');
    expect(r?.contract).toEqual({ in: null, out: null });
  });

  it('contract inclui name e fields quando schema é fornecido', async () => {
    const res = await inject({ method: 'GET', url: '/routes' });
    const routes = JSON.parse(res.body) as { path: string; contract: { in: { name: string; fields: unknown }; out: { name: string; fields: unknown } } }[];
    const r = routes.find(r => r.path === '/test-with-contract');
    expect(r?.contract.in).toEqual({ name: 'TestIn',  fields: { id: { type: 'uuid'    } } });
    expect(r?.contract.out).toEqual({ name: 'TestOut', fields: { ok: { type: 'boolean' } } });
  });

  it('não inclui rotas internas do framework', async () => {
    const res = await inject({ method: 'GET', url: '/routes' });
    const paths = (JSON.parse(res.body) as { path: string }[]).map(r => r.path);
    expect(paths).not.toContain('/contracts');
    expect(paths).not.toContain('/routes');
  });
});
