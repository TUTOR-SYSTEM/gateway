import { z } from 'zod';
import {
  createManagedUserSchema,
  updateManagedUserSchema,
  updateManagedStudentSchema,
  listManagedUsersQuerySchema,
  setManagedPasswordSchema,
} from './admin.schema';

export type CreateManagedUserDto = z.infer<typeof createManagedUserSchema>;
export type UpdateManagedUserDto = z.infer<typeof updateManagedUserSchema>;
export type UpdateManagedStudentDto = z.infer<typeof updateManagedStudentSchema>;
export type ListManagedUsersQueryDto = z.infer<typeof listManagedUsersQuerySchema>;
export type SetManagedPasswordDto = z.infer<typeof setManagedPasswordSchema>;
