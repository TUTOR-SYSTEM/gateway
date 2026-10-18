import { getTableConfig } from 'drizzle-orm/pg-core';
import { users } from 'src/database/schema';

describe('users.emailVerified column', () => {
  const column = getTableConfig(users).columns.find((c) => c.name === 'email_verified');

  it('exists on the users table as email_verified', () => {
    expect(column).toBeDefined();
  });

  it('is NOT NULL with a default of false', () => {
    expect(column?.notNull).toBe(true);
    expect(column?.hasDefault).toBe(true);
    expect(column?.default).toBe(false);
  });
});
