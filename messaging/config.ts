import { readFileSync, existsSync } from 'node:fs';
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

let _config: AppConfig | null = null;

function getConfig(): AppConfig {
  if (_config) return _config;
  const configFileName = process.env.SERVICE_NAME
    ? `${process.env.SERVICE_NAME}.json`
    : 'student-journey.json';
  const configPath = resolve(process.cwd(), configFileName);
  if (!existsSync(configPath)) {
    _config = { kafka_topics: {}, http_mapped: {} };
    return _config;
  }
  _config = JSON.parse(readFileSync(configPath, 'utf-8')) as AppConfig;
  return _config;
}

export function getKafkaTopic(name: string): string {
  const config = getConfig();
  const entry = config.kafka_topics?.[name];
  if (!entry) {
    throw new Error(`Kafka topic "${name}" is not configured`);
  }
  return entry.topic;
}

export function getHttpEndpoint(name: string): { url: string } {
  const config = getConfig();
  const entry = config.http_mapped?.[name];
  if (!entry) {
    throw new Error(`HTTP endpoint "${name}" is not configured`);
  }
  if (!entry.service) {
    throw new Error(`HTTP endpoint "${name}" has no service configured`);
  }
  return { url: `${entry.service}${entry.path}` };
}
