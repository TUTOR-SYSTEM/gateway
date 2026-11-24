import { updateSelfSchema } from 'src/packages/entities/user/user.schema';

describe('updateSelfSchema', () => {
  it('lets the caller send currentPassword together with a new email', () => {
    const parsed = updateSelfSchema.safeParse({
      email: 'new@example.com',
      currentPassword: 'Right-1!',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ email: 'new@example.com', currentPassword: 'Right-1!' });
  });

  it('still refuses privileged fields and unknown keys', () => {
    expect(updateSelfSchema.safeParse({ role: 'ADMIN' }).success).toBe(false);
    expect(updateSelfSchema.safeParse({ isActive: false }).success).toBe(false);
    expect(updateSelfSchema.safeParse({ somethingElse: 1 }).success).toBe(false);
  });
});
