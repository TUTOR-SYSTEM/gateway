import { z } from 'zod';

/** Key prefixes that may be read through the HTTP API. session:* and reset-password:* are excluded. */
export const REDIS_READABLE_KEY_PREFIXES = ['cache:', 'public:', 'stats:'] as const;

export const getRedisQuerySchema = z.object({
  key: z
    .string()
    .min(1, 'key query param is required')
    .refine((key) => REDIS_READABLE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)), {
      message: `key must start with one of: ${REDIS_READABLE_KEY_PREFIXES.join(', ')}`,
    }),
});
