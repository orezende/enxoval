/**
 * client/index.test.ts
 * Unit tests for defineHttpAliases and the call function.
 * fetch is stubbed globally; JSON file reading is mocked via vi.mock.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Reset module registry between tests to get a fresh tokenStorage singleton and clear mocks
beforeEach(async () => {
  vi.resetModules();
  mockFetch.mockReset();
  vi.mocked(readFileSync).mockReset();
  process.env.SERVICE_NAME = 'imperium';
  process.env.JWT_SECRET = 'test-secret';
  process.env.ATREIDES_URL = 'http://atreides:3002';
});

async function importFresh() {
  const mod = await import('./index');
  return mod;
}

describe('defineHttpAliases + call', () => {
  it('resolves GET path param and injects Bearer token from tokenStorage', async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      http: {
        getUser: { service: 'atreides', method: 'GET', path: '/users/:userId' },
      },
      kafka_topics: {},
    }));
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: '123', name: 'Alice', email: 'a@a.com', emailVerified: true, role: 'student', createdAt: '2024-01-01' }),
    });

    const { defineHttpAliases, tokenStorage } = await importFresh();
    const { createSchema, field } = await import('@enxoval/types');
    const UserData = createSchema({ id: field.string(), name: field.string(), email: field.string(), emailVerified: field.boolean(), role: field.string(), createdAt: field.string() });

    const { call } = defineHttpAliases({ getUser: UserData });

    await tokenStorage.run('my-jwt-token', async () => {
      const result = await call('getUser', { payload: { userId: '123' } });
      expect(result.name).toBe('Alice');
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://atreides:3002/users/123',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer my-jwt-token' }),
      }),
    );
  });

  it('uses X-Service-Token when tokenStorage is empty (Kafka flow)', async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      http: {
        getUser: { service: 'atreides', method: 'GET', path: '/users/:userId' },
      },
      kafka_topics: {},
    }));
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: '1', name: 'Bob', email: 'b@b.com', emailVerified: false, role: 'admin', createdAt: '2024-01-01' }),
    });

    const { defineHttpAliases } = await importFresh();
    const { createSchema, field } = await import('@enxoval/types');
    const UserData = createSchema({ id: field.string(), name: field.string(), email: field.string(), emailVerified: field.boolean(), role: field.string(), createdAt: field.string() });

    const { call } = defineHttpAliases({ getUser: UserData });

    // No tokenStorage.run() → storage is empty → should use X-Service-Token
    await call('getUser', { payload: { userId: '1' } });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://atreides:3002/users/1',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Service-Token': 'test-secret' }),
      }),
    );
  });

  it('skips auth header when route has auth: false', async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      http: {
        login: { service: 'atreides', method: 'POST', path: '/auth/login', auth: false },
      },
      kafka_topics: {},
    }));
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'jwt-tok' }),
    });

    const { defineHttpAliases } = await importFresh();
    const { createSchema, field } = await import('@enxoval/types');
    const AuthToken = createSchema({ token: field.string() });

    const { call } = defineHttpAliases({ login: AuthToken });
    await call('login', { payload: { email: 'a@b.com', password: 'pw' } });

    const [, opts] = mockFetch.mock.calls[0];
    expect((opts.headers as Record<string, string>)['Authorization']).toBeUndefined();
    expect((opts.headers as Record<string, string>)['X-Service-Token']).toBeUndefined();
  });

  it('sends remaining payload as JSON body for POST', async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      http: {
        createUser: { service: 'atreides', method: 'POST', path: '/users' },
      },
      kafka_topics: {},
    }));
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: '2', name: 'Eve', email: 'e@e.com', emailVerified: true, role: 'admin', createdAt: '2024-01-01' }),
    });

    const { defineHttpAliases } = await importFresh();
    const { createSchema, field } = await import('@enxoval/types');
    const UserData = createSchema({ id: field.string(), name: field.string(), email: field.string(), emailVerified: field.boolean(), role: field.string(), createdAt: field.string() });

    const { call } = defineHttpAliases({ createUser: UserData });
    await call('createUser', { payload: { name: 'Eve', email: 'e@e.com', password: 'pw', role: 'admin' } });

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://atreides:3002/users');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ name: 'Eve', email: 'e@e.com', password: 'pw', role: 'admin' });
    expect((opts.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('returns null on 404 when route has nullable: true', async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      http: {
        getStudent: { service: 'atreides', method: 'GET', path: '/students/:id', nullable: true },
      },
      kafka_topics: {},
    }));
    mockFetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });

    const { defineHttpAliases } = await importFresh();
    const { createSchema, field } = await import('@enxoval/types');
    const Student = createSchema({ id: field.string() });

    const { call } = defineHttpAliases({ getStudent: Student });
    const result = await call('getStudent', { payload: { id: '999' } });
    expect(result).toBeNull();
  });

  it('throws NotFoundError on 404 when route is not nullable', async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      http: {
        getUser: { service: 'atreides', method: 'GET', path: '/users/:id' },
      },
      kafka_topics: {},
    }));
    mockFetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({ message: 'not found' }) });

    const { defineHttpAliases } = await importFresh();
    const { createSchema, field } = await import('@enxoval/types');
    const UserData = createSchema({ id: field.string() });

    const { call } = defineHttpAliases({ getUser: UserData });
    await expect(call('getUser', { payload: { id: '999' } })).rejects.toThrow('not found');
  });

  it('throws UnauthorizedError on 401', async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      http: { getUser: { service: 'atreides', method: 'GET', path: '/users/:id' } },
      kafka_topics: {},
    }));
    mockFetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });

    const { defineHttpAliases } = await importFresh();
    const { createSchema, field } = await import('@enxoval/types');
    const UserData = createSchema({ id: field.string() });

    const { call } = defineHttpAliases({ getUser: UserData });
    await expect(call('getUser', { payload: { id: '1' } })).rejects.toThrow('Unauthorized');
  });

  it('throws ConflictError on 409', async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      http: { createUser: { service: 'atreides', method: 'POST', path: '/users' } },
      kafka_topics: {},
    }));
    mockFetch.mockResolvedValue({ ok: false, status: 409, json: async () => ({ message: 'E-mail em uso' }) });

    const { defineHttpAliases } = await importFresh();
    const { createSchema, field } = await import('@enxoval/types');
    const UserData = createSchema({ id: field.string() });

    const { call } = defineHttpAliases({ createUser: UserData });
    await expect(call('createUser', { payload: { email: 'a@a.com' } })).rejects.toThrow('E-mail em uso');
  });

  it('throws if alias is not registered in JSON', async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      http: {},
      kafka_topics: {},
    }));

    const { defineHttpAliases } = await importFresh();
    const { createSchema, field } = await import('@enxoval/types');
    const UserData = createSchema({ id: field.string() });

    expect(() => defineHttpAliases({ getUser: UserData })).toThrow('getUser');
  });

  it('throws if base URL env var is missing', async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      http: { getUser: { service: 'atreides', method: 'GET', path: '/users/:id' } },
      kafka_topics: {},
    }));
    delete process.env.ATREIDES_URL;

    const { defineHttpAliases } = await importFresh();
    const { createSchema, field } = await import('@enxoval/types');
    const UserData = createSchema({ id: field.string() });

    const { call } = defineHttpAliases({ getUser: UserData });
    await expect(call('getUser', { payload: { id: '1' } })).rejects.toThrow('ATREIDES_URL');
  });

  it('throws when required path param is missing from payload', async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      http: { getUser: { service: 'atreides', method: 'GET', path: '/users/:userId' } },
      kafka_topics: {},
    }));

    const { defineHttpAliases } = await importFresh();
    const { createSchema, field } = await import('@enxoval/types');
    const UserData = createSchema({ id: field.string() });
    const { call } = defineHttpAliases({ getUser: UserData });

    // No userId in payload — should throw about unresolved param
    await expect(call('getUser', { payload: {} })).rejects.toThrow('userId');
  });

  it('does not confuse :user with :userId path param', async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      http: { getUser: { service: 'atreides', method: 'GET', path: '/users/:userId' } },
      kafka_topics: {},
    }));
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'u1', name: 'Alice', email: 'a@a.com', emailVerified: true, role: 'student', createdAt: '2024-01-01' }),
    });

    const { defineHttpAliases } = await importFresh();
    const { createSchema, field } = await import('@enxoval/types');
    const UserData = createSchema({ id: field.string(), name: field.string(), email: field.string(), emailVerified: field.boolean(), role: field.string(), createdAt: field.string() });
    const { call } = defineHttpAliases({ getUser: UserData });
    await call('getUser', { payload: { userId: 'u1' } });

    const [url] = mockFetch.mock.calls[0];
    // Should be /users/u1, not /users/u1Id or /users/:userId
    expect(url).toBe('http://atreides:3002/users/u1');
  });
});
