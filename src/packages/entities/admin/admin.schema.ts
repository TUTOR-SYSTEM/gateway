import { z } from 'zod';

/**
 * Admin-managed accounts (TUTOR / STUDENT).
 *
 * The `role` is never taken from the request body — it is forced by the endpoint
 * (`/admin/tutors` → TUTOR, `/admin/students` → STUDENT). These schemas therefore
 * only cover the profile/credential fields the admin may set.
 */

/** Shared password-complexity refinement (mirrors the auth/user rules). */
function refinePassword(password: string, ctx: z.RefinementCtx): void {
  if (!/[a-z]/.test(password)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Password must include at least one lowercase letter (a-z)',
      path: ['password'],
    });
  }
  if (!/[A-Z]/.test(password)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Password must include at least one uppercase letter (A-Z)',
      path: ['password'],
    });
  }
  if (!/\d/.test(password)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Password must include at least one digit (0-9)',
      path: ['password'],
    });
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Password must include at least one special character',
      path: ['password'],
    });
  }
}

/** Create a tutor or student account. */
export const createManagedUserSchema = z
  .object({
    email: z
      .string({ message: 'Email is required' })
      .min(1, { message: 'Email is required' })
      .email({ message: 'Invalid email address' }),
    username: z
      .string()
      .trim()
      .min(1, { message: 'Username must be at least 1 character' })
      .max(50, { message: 'Username must be at most 50 characters' })
      .optional(),
    firstName: z
      .string({ message: 'First name is required' })
      .trim()
      .min(2, { message: 'First name must be at least 2 characters' })
      .max(100, { message: 'First name must be at most 100 characters' }),
    lastName: z
      .string({ message: 'Last name is required' })
      .trim()
      .min(2, { message: 'Last name must be at least 2 characters' })
      .max(100, { message: 'Last name must be at most 100 characters' }),
    password: z
      .string({ message: 'Password is required' })
      .min(8, { message: 'Password must be at least 8 characters' })
      .max(20, { message: 'Password must be at most 20 characters' }),
    phone: z.string().trim().max(20, { message: 'Phone must be at most 20 characters' }).optional(),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
    dateOfBirth: z.coerce.date().optional(),
    school: z.string().max(255, { message: 'School must be at most 255 characters' }).optional(),
    subjects: z
      .array(z.string().trim().min(1, { message: 'Subject must not be empty' }))
      .max(20, { message: 'At most 20 subjects allowed' })
      .optional(),
    description: z
      .string()
      .max(5000, { message: 'Description must be at most 5000 characters' })
      .optional(),
    isActive: z.boolean().optional().default(true),
  })
  .strict()
  .superRefine((data, ctx) => refinePassword(data.password, ctx));

/** Update a tutor or student account — every field optional, no password here. */
export const updateManagedUserSchema = z
  .object({
    email: z.string().email({ message: 'Invalid email address' }).optional(),
    username: z.string().trim().min(1).max(50).optional(),
    firstName: z.string().trim().min(2).max(100).optional(),
    lastName: z.string().trim().min(2).max(100).optional(),
    phone: z.string().trim().max(20).nullable().optional(),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER']).nullable().optional(),
    dateOfBirth: z.coerce.date().nullable().optional(),
    school: z.string().max(255).nullable().optional(),
    subjects: z
      .array(z.string().trim().min(1, { message: 'Subject must not be empty' }))
      .max(20, { message: 'At most 20 subjects allowed' })
      .nullable()
      .optional(),
    description: z.string().max(5000).nullable().optional(),
    avatar: z.string().url({ message: 'Avatar must be a url ...' }).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

/**
 * Update a STUDENT account — superset of `updateManagedUserSchema` covering the
 * remaining `users` columns relevant to a student profile (address, parent/tutor
 * links, student code). Kept separate from the tutor update schema so widening it
 * never leaks student-only fields onto `/admin/tutors/:id`.
 */
export const updateManagedStudentSchema = updateManagedUserSchema.extend({
  userCode: z.string().max(6, { message: 'User code must be at most 6 characters' }).optional(),
  address: z.string().nullable().optional(),
  district: z.string().max(30).nullable().optional(),
  province: z.string().max(30).nullable().optional(),
  parentId: z.string().uuid({ message: 'parentId must be uuid' }).nullable().optional(),
  tutorId: z.string().uuid({ message: 'tutorId must be uuid' }).nullable().optional(),
});

/** Paginated list query for `/admin/tutors` and `/admin/students`. */
export const listManagedUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().min(1).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});
