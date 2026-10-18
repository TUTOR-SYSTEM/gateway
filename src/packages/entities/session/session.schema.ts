import { z } from 'zod';

export const classSessionStatusEnum = z.enum([
  'SCHEDULED',
  'ONGOING',
  'COMPLETED',
  'CANCELLED',
  'POSTPONED',
]);

const sessionResourceSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  url: z.string().url('Invalid URL'),
  key: z.string().min(1, 'Key is required'),
});

const sessionAgendaItemSchema = z.object({
  time: z.string().min(1, 'Time is required'),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
});

const sessionBaseSchema = z.object({
  classId: z.string().uuid('Invalid class ID'),
  lessonId: z.string().uuid('Invalid lesson ID').optional().nullable(),
  tutorId: z.string().uuid('Invalid tutor ID').optional().nullable(),
  title: z.string().max(255, 'Title too long').optional(),
  description: z.string().optional(),
  sessionNumber: z.coerce.number().int().min(1, 'Session number must be >= 1'),
  theoryUrls: z.array(sessionResourceSchema).default([]),
  exerciseUrls: z.array(sessionResourceSchema).default([]),
  startAt: z.coerce.date({ message: 'Start time must be a valid date' }),
  endAt: z.coerce.date({ message: 'End time must be a valid date' }),
  location: z.string().optional(),
  status: classSessionStatusEnum.default('SCHEDULED').optional(),
  note: z.string().optional(),
  actualStartAt: z.coerce.date().optional().nullable(),
  actualEndAt: z.coerce.date().optional().nullable(),
  objectives: z.array(z.string().min(1)).default([]),
  agenda: z.array(sessionAgendaItemSchema).default([]),
  exerciseDueAt: z.coerce.date().optional().nullable(),
});

const SESSION_RANGE_ISSUE = { message: 'endAt must be after startAt', path: ['endAt'] };
const endsAfterStart = (v: { startAt?: Date; endAt?: Date }): boolean =>
  !v.startAt || !v.endAt || v.endAt > v.startAt;

export const createSessionsSchema = z.object({
  classId: z.string().uuid('Invalid class ID'),
  sessions: z
    .array(sessionBaseSchema.omit({ classId: true }).refine(endsAfterStart, SESSION_RANGE_ISSUE))
    .min(1, 'At least 1 session is required')
    .max(50, 'At most 50 sessions allowed'),
});

export const getSessionsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
  status: classSessionStatusEnum.optional(),
  classId: z.string().uuid('Invalid class ID').optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

/**
 * Update schema defined explicitly (not `.partial()` on the create schema): with
 * `.partial()`, Zod would still fill absent fields with their defaults
 * (theoryUrls/exerciseUrls -> [], status -> 'SCHEDULED'), which the repository then
 * writes, silently wiping existing materials/status on a partial update.
 */
const sessionUpdateBaseSchema = z.object({
  lessonId: z.string().uuid('Invalid lesson ID').optional().nullable(),
  tutorId: z.string().uuid('Invalid tutor ID').optional().nullable(),
  title: z.string().max(255, 'Title too long').optional(),
  description: z.string().optional(),
  sessionNumber: z.coerce.number().int().min(1, 'Session number must be >= 1').optional(),
  theoryUrls: z.array(sessionResourceSchema).optional(),
  exerciseUrls: z.array(sessionResourceSchema).optional(),
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().optional(),
  location: z.string().optional(),
  status: classSessionStatusEnum.optional(),
  note: z.string().optional(),
  actualStartAt: z.coerce.date().optional().nullable(),
  actualEndAt: z.coerce.date().optional().nullable(),
  objectives: z.array(z.string().min(1)).optional(),
  agenda: z.array(sessionAgendaItemSchema).optional(),
  exerciseDueAt: z.coerce.date().optional().nullable(),
});

export const createSessionSchema = sessionBaseSchema.refine(endsAfterStart, SESSION_RANGE_ISSUE);
export const updateSessionSchema = sessionUpdateBaseSchema.refine(
  endsAfterStart,
  SESSION_RANGE_ISSUE,
);
