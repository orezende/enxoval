import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Direction = 'consumer' | 'producer' | 'both';

interface KafkaTopicEntry {
  topic: string;
  direction: Direction;
}

interface HttpMappedEntry {
  service: string;
  path: string;
}

interface AppConfig {
  kafka_topics: Record<string, KafkaTopicEntry>;
  http_mapped: Record<string, HttpMappedEntry>;
}

const configFileName = process.env.SERVICE_NAME
  ? `${process.env.SERVICE_NAME}.json`
  : 'student-journey.json';

const config: AppConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), configFileName), 'utf-8'),
);

export function getKafkaTopic(name: string): string {
  const entry = config.kafka_topics?.[name];
  if (!entry) {
    throw new Error(`Kafka topic "${name}" is not configured in ${configFileName}`);
  }
  return entry.topic;
}

export function getHttpEndpoint(name: string): { url: string } {
  const entry = config.http_mapped?.[name];
  if (!entry) {
    throw new Error(`HTTP endpoint "${name}" is not configured in ${configFileName}`);
  }
  if (!entry.service) {
    throw new Error(`HTTP endpoint "${name}" has no service configured in ${configFileName}`);
  }
  return { url: `${entry.service}${entry.path}` };
}
