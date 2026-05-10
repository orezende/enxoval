import { kafka } from './kafka';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

interface ServiceConfig {
  kafka_topics?: Record<string, { topic: string }>;
  feature_flags?: Record<string, boolean>;
}

export async function ensureTopics(): Promise<void> {
  const configFileName = process.env.SERVICE_NAME
    ? `${process.env.SERVICE_NAME}.json`
    : 'student-journey.json';
  const configPath = resolve(process.cwd(), configFileName);

  const configTopics: string[] = [];
  if (existsSync(configPath)) {
    const config: ServiceConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    configTopics.push(...Object.values(config.kafka_topics ?? {}).map(({ topic }) => topic));
  }

  const dlqTopic = process.env.SERVICE_NAME ? `${process.env.SERVICE_NAME}-dlq` : null;
  const allTopics = dlqTopic ? [...configTopics, dlqTopic] : configTopics;
  if (allTopics.length === 0) return;

  const admin = kafka.admin();
  await admin.connect();

  const existing = new Set(await admin.listTopics());
  const toCreate = allTopics.filter((topic) => !existing.has(topic));

  if (toCreate.length > 0) {
    await admin.createTopics({
      topics: toCreate.map((topic) => ({ topic, numPartitions: 1, replicationFactor: 1 })),
    });
  }

  await admin.disconnect();
}
