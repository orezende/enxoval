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

Runtime validation schemas with TypeScript types. Provides a `Schema` class that describes field types, validates input, and generates the `contracts.json` used by kanly.

```ts
import { Schema, uuid, string, literal } from '@enxoval/types';

class CreateUserWireIn extends Schema {
  id = uuid();
  name = string();
  role = literal('student', 'admin');

  static describe() {
    return {
      _meta: { method: 'POST', path: '/users' },
      id: { type: 'uuid' },
      name: { type: 'string' },
      role: { type: 'literal', values: ['student', 'admin'] },
    };
  }
}
```

---

## @enxoval/http

Fastify wrapper that exposes `get`, `post`, `html`, `listen` and `inject` helpers. Also ships the `kanly` CLI for contract validation.

```ts
import { listen, get, post } from '@enxoval/http';

get('/health', async () => ({ ok: true }));
post('/users', async (req) => createUser(req.body));

listen({ port: 3000 });
```

### kanly CLI

Validates wire contract compatibility between services. Runs automatically in CI — see [Contract Validation](#contract-validation).

```bash
# validate against live services
ATREIDES_URL=http://localhost:3002 npx kanly

# validate against local contract registry
KANLY_LOCAL_DIR=./partners npx kanly
```

---

## @enxoval/db

TypeORM wrapper with a migration runner CLI. Handles connection setup, entity registration and exposes migration commands.

```ts
import { createDataSource } from '@enxoval/db';

const dataSource = createDataSource({
  entities: [UserEntity],
  migrations: [__dirname + '/migrations/*.js'],
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

Kafka producer/consumer wrapper built on kafkajs. Reads topic configuration from `config.json` at runtime.

```ts
import { producer, consumer, ensureTopics } from '@enxoval/messaging';

// produce
await producer.send({ topic: 'userCreated', messages: [{ value: JSON.stringify(payload) }] });

// consume
await consumer.subscribe({ topic: 'userCreated', fromBeginning: false });
await consumer.run({
  eachMessage: async ({ message }) => {
    const payload = JSON.parse(message.value!.toString());
    await handleUserCreated(payload);
  },
});

// ensure topics exist on startup (reads config.json)
await ensureTopics();
```

---

## @enxoval/auth

JWT HS256 middleware and helpers. Validates `Authorization: Bearer <token>` headers and exposes `sign` / `verify`.

```ts
import { authMiddleware, sign, verify } from '@enxoval/auth';

// fastify middleware
app.addHook('preHandler', authMiddleware);

// sign a token
const token = sign({ userId: 'uuid', role: 'student' });

// verify
const payload = verify(token); // throws if invalid
```

Requires `JWT_SECRET` in environment. Token payload is available as `req.user` after the middleware.

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

Each service exposes `wire/in` and `wire/out` schemas that describe the shape of data it consumes and produces. After every build, `contracts.json` is generated and published to [dune-lab/contracts](https://github.com/dune-lab/contracts).

To add path/topic metadata to a wire type:

```ts
static describe() {
  return {
    _meta: { method: 'POST', path: '/users' },
    // or for Kafka:
    _meta: { topic: 'USER_CREATED' },
    id: { type: 'uuid' },
  };
}
```

kanly uses this metadata in validation logs and error messages.
