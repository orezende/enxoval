import { createSchema, field } from '@enxoval/types';

export const HARKONNEN_STATUSES = ['pending', 'reprocessed', 'dismissed'] as const;

export const HarkonnenMessage = createSchema({
  id: field.uuid(),
  originalTopic: field.string(),
  name: field.string(),
  payload: field.string(),
  error: field.string(),
  failedAt: field.string(),
  status: field.literal(...HARKONNEN_STATUSES),
  reprocessedAt: field.nullable(field.string()),
  createdAt: field.string(),
});

export const HarkonnenMessageInput = createSchema({
  originalTopic: field.string(),
  name: field.string(),
  payload: field.string(),
  error: field.string(),
  failedAt: field.string(),
});
