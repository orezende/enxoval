import { logger } from '@enxoval/observability';
import { getKafkaTopic } from '../config';
import { nextCid } from '@enxoval/observability';
import { kafka } from '../kafka';
import { publishRaw } from '../producer/index';
import { registeredTopics, storeTopicContract, type TopicContractSide } from '../registry';

export type MessageHandler<T = unknown> = (message: T) => Promise<void> | void;

const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(fn: () => Promise<void>, attemptsLeft: number, delayMs: number): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (attemptsLeft <= 0) throw err;
    await sleep(delayMs);
    await withRetry(fn, attemptsLeft - 1, delayMs * 2);
  }
}

/**
 * Registra um consumer Kafka para o tópico identificado por `name`.
 * @param name - Chave do tópico (ex: 'journeyInitiated')
 * @param handler - Função chamada para cada mensagem recebida
 * @param contract - Schema opcional do contrato wire (para introspection via GET /topics)
 */
export function consume<T extends Record<string, unknown>>(
  name: string,
  handler: MessageHandler<T>,
  contract?: TopicContractSide,
): void {
  const topic = getKafkaTopic(name);
  registeredTopics.push({
    topicKey: name,
    topic,
    direction: 'consumer',
    contract: storeTopicContract(contract ?? null),
  });

  const serviceName = process.env.SERVICE_NAME || name;
  const dlqTopic = `${serviceName}-dlq`;
  const consumer = kafka.consumer({ groupId: `${serviceName}-${name}` });

  consumer
    .connect()
    .then(() => consumer.subscribe({ topic, fromBeginning: false }))
    .then(() => {
      logger.info({ topic, name }, 'consumer: subscribed');
      return consumer.run({
        eachMessage: async ({ message }) => {
          const raw = message.value?.toString();
          if (!raw) return;
          const payload = JSON.parse(raw) as T;
          const incoming = (payload as { cid?: string }).cid;
          const cid = incoming ? nextCid(incoming) : undefined;
          logger.info({ cid, topic, name, eventId: (payload as { eventId?: string }).eventId }, 'consumer: message received');

          let retryCount = 0;
          try {
            await withRetry(async () => {
              retryCount++;
              await handler(payload);
            }, MAX_RETRIES, 500);
          } catch (err) {
            const cid = (payload as { cid?: string }).cid;
            logger.error({ err, cid, topic, name, payload }, 'consumer: message failed after retries, sending to DLQ');
            await publishRaw(dlqTopic, {
              originalTopic: topic,
              name,
              payload,
              error: err instanceof Error ? err.message : String(err),
              failedAt: new Date().toISOString(),
              serviceName,
              retryCount,
              cid,
            });
          }
        },
      });
    })
    .catch((err) => {
      logger.error({ err, topic, name }, 'consumer: failed to start');
    });
}
