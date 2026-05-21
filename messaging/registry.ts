/**
 * registry.ts
 *
 * Registry de tópicos Kafka do serviço, populado por consume() e registerProducer().
 * Expõe registeredTopics[] para introspection via GET /topics no @enxoval/http.
 *
 * Input:  chamadas a storeTopicContract() e pushes diretos a registeredTopics
 * Output: registeredTopics[] — array mutável com todos os tópicos registrados
 */
import type { FieldDescriptor } from '@enxoval/types';

/** Schema-like: qualquer objeto com describe() que retorna FieldDescriptor map. */
export type SchemaLike = { describe?(): Record<string, FieldDescriptor> };

/** Um lado do contrato de tópico: schema + nome descritivo. Null = sem schema. */
export type TopicContractSide = { schema: SchemaLike; name: string } | null;

/** Representação armazenada do contrato (schema resolvido para campos planos). */
export type TopicContractStored = { name: string; fields: Record<string, FieldDescriptor> } | null;

/** Entrada no registry de tópicos. */
export type TopicEntry = {
  topicKey: string;
  topic: string;
  direction: 'consumer' | 'producer';
  contract: TopicContractStored;
};

/**
 * Array global de tópicos registrados neste serviço.
 * Populado por consume() e registerProducer() durante o setup do serviço.
 */
export const registeredTopics: TopicEntry[] = [];

/**
 * Converte um TopicContractSide em representação armazenada, chamando describe().
 * @param side - Lado do contrato a armazenar, ou null
 * @returns TopicContractStored com name e fields resolvidos, ou null
 */
export function storeTopicContract(side: TopicContractSide): TopicContractStored {
  if (!side) return null;
  return { name: side.name, fields: side.schema.describe?.() ?? {} };
}
