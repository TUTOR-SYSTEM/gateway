import { z } from 'zod';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ phải có dạng HH:mm');

export const updateTeachingSettingsSchema = z
  .object({
    sessionDurationMinutes: z.coerce.number().int().min(15, 'Thời lượng tối thiểu 15 phút').max(480),
    defaultFee: z.coerce.number().min(0, 'Học phí không được âm').max(1_000_000_000),
    timezone: z.string().min(1).max(64),
    workHoursStart: hhmm,
    workHoursEnd: hhmm,
    remindStudents: z.boolean(),
    allowOnlineBooking: z.boolean(),
    autoInvoiceMonthly: z.boolean(),
    breakBetweenSessions: z.boolean(),
  })
  .refine((v) => v.workHoursEnd > v.workHoursStart, {
    message: 'Giờ kết thúc làm việc phải sau giờ bắt đầu',
    path: ['workHoursEnd'],
  });

export type UpdateTeachingSettingsDto = z.infer<typeof updateTeachingSettingsSchema>;

export const updatePaymentSettingsSchema = z.object({
  bankName: z.string().trim().min(1, 'Vui lòng nhập tên ngân hàng').max(100),
  accountHolder: z.string().trim().min(1, 'Vui lòng nhập chủ tài khoản').max(255),
  accountNumber: z
    .string()
    .transform((v) => v.replace(/\s/g, ''))
    .pipe(z.string().regex(/^\d{6,30}$/, 'Số tài khoản chỉ gồm chữ số (6–30 số)')),
  branch: z.string().trim().max(255),
  autoPaymentReminder: z.boolean(),
  electronicReceipt: z.boolean(),
});

export type UpdatePaymentSettingsDto = z.infer<typeof updatePaymentSettingsSchema>;
