# enxoval

Shared libraries for dune-lab Node.js microservices. Published to npm under the `@enxoval` scope.

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| [`@enxoval/types`](#enxovaltypes) | 1.0.6 | Runtime validation schemas, branded UUID, fn/asyncFn wrappers |
| [`@enxoval/http`](#enxovalhttp) | 1.0.10 | Fastify wrapper, route helpers, kanly contract CLI |
| [`@enxoval/db`](#enxovaldb) | 1.0.3 | TypeORM wrapper, migration runner CLI |
| [`@enxoval/messaging`](#enxovalmessaging) | 1.0.2 | Kafka producer/consumer, topic setup |
| [`@enxoval/auth`](#enxovalauth) | 1.0.0 | JWT middleware, sign and verify helpers |
| [`@enxoval/observability`](#enxovalobservability) | 1.0.1 | Structured logger (pino) |

---

## @enxoval/types

Runtime validation and typed function wrappers. The core of dune-lab's type safety — every value that crosses a boundary is validated at runtime and typed at compile time.

### createSchema + field

Define a schema with `createSchema`. Call `.parse(raw)` to validate and get a fully typed value.

```ts
import { createSchema, field } from '@enxoval/types';

const CreateUserWireIn = createSchema({
  name: field.string(),
  email: field.string(),
  role: field.literal('student', 'admin'),
});

const input = CreateUserWireIn.parse(req.body);
// input is typed: { name: string; email: string; role: 'student' | 'admin' }
```

Available field types: `field.uuid()`, `field.string()`, `field.number()`, `field.boolean()`, `field.date()`, `field.literal(...values)`.

---

### fn and asyncFn

Schema-bounded function wrappers. They validate input before execution and output before returning — catching both bad incoming data and programmer mistakes in one place.

**`fn`** — synchronous transform between two schemas:

```ts
import { fn } from '@enxoval/types';

// adapter: DB row → domain model
export const fromDbWire = fn(UserDbWire, User, (wire) => ({
  id: asUUID(wire.id),
  name: wire.name,
  email: wire.email,
  emailVerified: wire.email_verified,
  role: wire.role as Role,
  createdAt: wire.created_at,
}));

// adapter: domain model → HTTP wire out
export const toWireOut = fn(User, UserWireOut, (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  createdAt: u.createdAt.toISOString(),
}));
```

**`asyncFn` with output schema** — for controllers that return a value:

```ts
import { asyncFn } from '@enxoval/types';

export const createUser = asyncFn(CreateUserWireIn, User, async (input) => {
  const existing = await userDb.findByEmail(input.email);
  if (existing) return existing;

  const passwordHash = await hashPassword(input.password);
  return userDb.insert(buildUser({ ...input, passwordHash }));
});
```

**`asyncFn` without output schema** — for Kafka consumers and fire-and-forget side effects:

```ts
export const journeyStarted = asyncFn(Event, async (event) => {
  await journeyDb.updateStep({ id: event.journeyId, currentStep: 'DIAGNOSTIC_TRIGGERED' });
  await publish('diagnosticTriggered', event);
});
```

**Why this matters:**

| Without fn/asyncFn | With fn/asyncFn |
|--------------------|-----------------|
| Manual `.parse()` scattered across every handler | Single declaration — parse happens automatically |
| TypeScript types must be repeated manually | Types inferred from schemas — no duplication |
| Output shape only caught by TypeScript | Output validated at runtime — catches shape mismatches |
| `unknown` leaks into business logic | Function body always receives a typed, validated value |

The pattern covers every layer: adapters validate DB ↔ model transforms, controllers validate wire_in ↔ model, Kafka consumers validate message payloads. No raw `unknown` ever reaches business logic.

---

### UUID

Branded `UUID` type that prevents plain strings from being passed where a UUID is expected.

```ts
import { UUID, toUUID, asUUID, isUUID } from '@enxoval/types';

// throws if not a valid UUID format
const id: UUID = toUUID(req.params.id);

// cast without validation (use when value is already trusted)
const id: UUID = asUUID(row.id);

// type guard
if (isUUID(value)) { ... }
```

---

### Error classes

Typed errors that map to HTTP status codes in `@enxoval/http`.

```ts
import { NotFoundError, ConflictError, UnauthorizedError } from '@enxoval/types';

throw new NotFoundError('User not found');
throw new ConflictError('Email already registered');
throw new UnauthorizedError('Invalid credentials');
```

| Class | HTTP status |
|-------|------------|
| `AppError` | 500 (base class) |
| `NotFoundError` | 404 |
| `ConflictError` | 409 |
| `ValidationError` | 400 |
| `UnprocessableError` | 422 |
| `UnauthorizedError` | 401 |

---

## @enxoval/http

Fastify wrapper that exposes route helpers and `listen`. Also ships the `kanly` CLI for contract validation.

```ts
import { get, post, listen } from '@enxoval/http';

get('/health', async () => ({ ok: true }));
post('/users', async (req) => createUser(req.body));

listen({ port: 3000 });
```

Other exports: `getWith`, `getWithAuth`, `postOk`, `put`, `patch`, `del`, `html`, `inject`, `addPreHandler`.

### kanly CLI

Validates wire contract compatibility between services. Runs automatically in CI.

```bash
# validate against live services
ATREIDES_URL=http://localhost:3002 npx kanly

# validate against local contract registry
KANLY_LOCAL_DIR=./partners npx kanly
```

---

## @enxoval/db

TypeORM wrapper with Postgres support and a migration runner CLI.

```ts
import { createDataSource, defineEntity, column } from '@enxoval/db';

const dataSource = createDataSource({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [UserEntity],
  migrationsDir: __dirname + '/migrations',
});

await dataSource.initialize();
```

**Migration CLI** (via `postbuild` in each service):

```bash
npm run migration:generate -- add-user-table
npm run migration:run
npm run migration:revert
```

---

## @enxoval/messaging

Kafka producer/consumer wrapper. Resolves topic names from `config.json` at runtime, retries on failure and routes to a DLQ after max retries.

```ts
import { publish, subscribe, connect, disconnect, ensureTopics } from '@enxoval/messaging';

// produce
await publish('userCreated', { userId, email, role });

// consume
subscribe('userCreated', async (message) => {
  await handleUserCreated(message);
});

// ensure topics exist on startup (reads config.json)
await ensureTopics();
```

---

## @enxoval/auth

JWT HS256 middleware and helpers. Sets up auth on all routes and provides `signToken` and `getCurrentUser`.

```ts
import { setupAuth, signToken, getCurrentUser } from '@enxoval/auth';

// setup middleware (call once at startup, before listen)
setupAuth({ exclude: ['/health', '/auth/login'] });

// sign a token
const token = signToken(userId, role);

// read current user inside a request handler
const user = getCurrentUser(); // { userId, role }
```

Requires `JWT_SECRET` in environment. `JWT_EXPIRES_IN` is optional (default: `1h`).

---

## @enxoval/observability

Structured logger built on pino. Outputs JSON in production, pretty-prints in development.

```ts
import { logger } from '@enxoval/observability';

logger.info('server started');
logger.error({ err }, 'something went wrong');
```

Log level is controlled by `LOG_LEVEL` env var (default: `info`).

---

## Publishing

Packages are published to npm automatically when a tag `v*` is pushed:

```bash
git tag v1.0.17
git push origin v1.0.17
```

The `publish` workflow:
1. Builds all packages
2. Publishes any version not yet on npm
3. Opens bump PRs in all dune-lab service repos updating `@enxoval/*` dependencies

---

## Contract Validation

Each service exposes `wire/in` and `wire/out` schemas built with `createSchema`. After every build, `contracts.json` is generated automatically via the `postbuild` script and published to [dune-lab/contracts](https://github.com/dune-lab/contracts).

kanly reads this registry on every PR and validates that each service's `wire_in` fields are compatible with the partner's `wire_out`.
