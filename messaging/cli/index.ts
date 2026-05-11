#!/usr/bin/env node
/**
 * cli/index.ts
 *
 * Entry point for the `enxoval` CLI. Dispatches subcommands.
 *
 * Usage:
 *   enxoval create-topic <TOPIC-NAME> [--direction consumer|producer|both]
 */

import { kafka } from '../kafka';

type Direction = 'consumer' | 'producer' | 'both';

const DIRECTIONS: Direction[] = ['consumer', 'producer', 'both'];

async function createTopic(args: string[]): Promise<void> {
  const topicName = args.find((a) => !a.startsWith('--'));
  const dirIdx = args.indexOf('--direction');
  const direction: string = dirIdx !== -1 ? args[dirIdx + 1] : 'both';

  if (!topicName) {
    console.error('Usage: enxoval create-topic <TOPIC-NAME> [--direction consumer|producer|both]');
    process.exit(1);
  }

  if (!DIRECTIONS.includes(direction as Direction)) {
    console.error(`Invalid --direction "${direction}". Must be one of: ${DIRECTIONS.join(', ')}`);
    process.exit(1);
  }

  const topics = [topicName, `${topicName}-dlq`];

  const admin = kafka.admin();
  await admin.connect();

  const existing = new Set(await admin.listTopics());
  const toCreate = topics.filter((t) => !existing.has(t));

  if (toCreate.length > 0) {
    await admin.createTopics({
      topics: toCreate.map((topic) => ({ topic, numPartitions: 1, replicationFactor: 1 })),
    });
    toCreate.forEach((t) => console.log(`✓ Created topic: ${t}`));
  } else {
    console.log(`Topics already exist: ${topics.join(', ')}`);
  }

  await admin.disconnect();
  console.log(`Direction: ${direction} (informational — configure your consumer/producer in code)`);
}

(async () => {
  const [subcommand, ...rest] = process.argv.slice(2);

  if (subcommand === 'create-topic') {
    await createTopic(rest);
  } else {
    console.error(`Unknown command: ${subcommand || '(none)'}`);
    console.error('Available commands: create-topic');
    process.exit(1);
  }
})();
