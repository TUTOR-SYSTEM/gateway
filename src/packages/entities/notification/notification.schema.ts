import { z } from 'zod';

/** Any control character (incl. tab/CR/LF, which browsers strip) or backslash. */
const UNSAFE_REDIRECT_CHARS = /[\p{Cc}\\]/u;

/**
 * Internal path only (`/x`; never `//x`) or an absolute `https://` URL whose host is listed in
 * `NOTIFICATION_REDIRECT_HOSTS` (comma-separated). Anything else (javascript:, protocol-relative,
 * control characters, unknown hosts) is rejected.
 */
export function isSafeRedirectUrl(value: string): boolean {
  if (UNSAFE_REDIRECT_CHARS.test(value)) return false;
  if (value.startsWith('/')) return !value.startsWith('//');
  if (!value.startsWith('https://')) return false;
  const allowedHosts = (process.env.NOTIFICATION_REDIRECT_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  try {
    return allowedHosts.includes(new URL(value).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export const notificationTypeEnum = z.enum(['SYSTEM', 'TUITION', 'STUDENT', 'TUTOR']);
export const notificationActionEnum = z.enum(['VIEW', 'CONTACT', 'PAYMENT', 'UPDATE']);

export const createNotificationSchema = z.object({
  type: notificationTypeEnum,
  title: z
    .string({ message: 'Title is required' })
    .min(1, 'Title is required')
    .max(255, 'Title too long'),
  senderId: z.string().uuid('senderId must be uuid ...').optional().nullable(),
  content: z.string({ message: 'Content must be string ...' }),
  subContent: z.string({ message: 'subContent must be string ...' }).max(255).optional(),
  userId: z.string().uuid('userId must be uuid ...').optional().nullable(),
  classId: z.string().uuid('classId must be uuid ...').optional().nullable(),
  studentId: z.string().uuid('studentId must be uuid ...').optional().nullable(),
  redirectUrl: z
    .string()
    .max(500)
    .refine(isSafeRedirectUrl, 'redirectUrl must be an internal path or an https URL')
    .optional(),
  actionLabel: z.string().max(100).optional(),
  actionType: notificationActionEnum.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const getNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  // An empty `search` means "no filter" rather than a 400.
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined)),
  type: notificationTypeEnum.optional(),
  isRead: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
