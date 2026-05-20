/**
 * registry.test.ts
 *
 * Testa que consume() e registerProducer() populam registeredTopics
 * com os campos corretos, incluindo o contract armazenado.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./config', () => ({
  getKafkaTopic: (name: string) => `enxoval.${name}`,
}));

vi.mock('./kafka', () => ({
  kafka: {
    consumer: () => ({
      connect: () => Promise.reject(new Error('test: no kafka')),
      subscribe: () => {},
      run: () => {},
    }),
    producer: () => ({
      connect: vi.fn(),
      send: vi.fn(),
      disconnect: vi.fn(),
    }),
  },
}));

import { createSchema, field } from '@enxoval/types';
import { registeredTopics, storeTopicContract } from './registry';
import { registerProducer } from './producer/index';
import { consume } from './consumer/index';

const TestSchema = createSchema({ id: field.uuid(), name: field.string() });

beforeEach(() => {
  registeredTopics.length = 0;
});

describe('storeTopicContract', () => {
  it('retorna null quando side é null', () => {
    expect(storeTopicContract(null)).toBeNull();
  });

  it('armazena name e fields resolvidos quando side fornecido', () => {
    const result = storeTopicContract({ schema: TestSchema, name: 'TestSchema' });
    expect(result).toEqual({
      name: 'TestSchema',
      fields: { id: { type: 'uuid' }, name: { type: 'string' } },
    });
  });
});

describe('registerProducer', () => {
  it('adiciona entry com direction producer e topic resolvido', () => {
    registerProducer('myEvent', { schema: TestSchema, name: 'TestSchema' });
    expect(registeredTopics).toHaveLength(1);
    expect(registeredTopics[0]).toEqual({
      topicKey: 'myEvent',
      topic: 'enxoval.myEvent',
      direction: 'producer',
      contract: { name: 'TestSchema', fields: { id: { type: 'uuid' }, name: { type: 'string' } } },
    });
  });

  it('adiciona entry com contract null quando contract é null', () => {
    registerProducer('bareTopic', null);
    expect(registeredTopics[0].contract).toBeNull();
  });
});

describe('consume com contract', () => {
  it('adiciona entry com direction consumer e contract armazenado', () => {
    consume('consumedEvent', async () => {}, { schema: TestSchema, name: 'TestSchema' });
    expect(registeredTopics).toHaveLength(1);
    expect(registeredTopics[0].direction).toBe('consumer');
    expect(registeredTopics[0].topicKey).toBe('consumedEvent');
    expect(registeredTopics[0].contract?.name).toBe('TestSchema');
  });

  it('adiciona entry com contract null quando 3º arg omitido', () => {
    consume('bareConsumer', async () => {});
    expect(registeredTopics[0].contract).toBeNull();
  });
});
