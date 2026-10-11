import {
  AUTH_MESSAGES,
  forgotPasswordSchema,
  loginByUserCodeSchema,
  loginSchema,
  passwordFieldSchema,
  refreshTokenBodySchema,
  registerSchema,
  resetPasswordSchema,
} from 'src/packages/entities/auth/auth.schema';
import { ERROR_MESSAGES } from 'src/data/constants';

function messagesOf(result: { success: boolean; error?: { issues: { message: string; path: PropertyKey[] }[] } }) {
  return result.success ? [] : result.error!.issues.map((i) => i.message);
}

describe('passwordFieldSchema', () => {
  it('accepts a password meeting every rule', () => {
    expect(passwordFieldSchema.safeParse('Abcdef1!').success).toBe(true);
  });

  it('accepts a password exactly 6 characters long (lower bound)', () => {
    expect(passwordFieldSchema.safeParse('Abc1!x').success).toBe(true);
  });

  it('accepts a password exactly 25 characters long (upper bound)', () => {
    expect(passwordFieldSchema.safeParse(`Aa1!${'x'.repeat(21)}`).success).toBe(true);
  });

  it('rejects a missing password with the required message', () => {
    expect(messagesOf(passwordFieldSchema.safeParse(undefined))).toContain(AUTH_MESSAGES.PASSWORD_REQUIRED);
  });

  it('rejects a non-string password with the required message', () => {
    expect(messagesOf(passwordFieldSchema.safeParse(123456))).toContain(AUTH_MESSAGES.PASSWORD_REQUIRED);
  });

  it('rejects 5 characters with the min-length message', () => {
    expect(messagesOf(passwordFieldSchema.safeParse('Ab1!x'))).toContain(AUTH_MESSAGES.PASSWORD_MIN);
  });

  it('rejects 26 characters with the max-length message', () => {
    expect(messagesOf(passwordFieldSchema.safeParse(`Aa1!${'x'.repeat(22)}`))).toContain(
      AUTH_MESSAGES.PASSWORD_MAX,
    );
  });

  it('reports the missing lowercase letter', () => {
    expect(messagesOf(passwordFieldSchema.safeParse('ABCDEF1!'))).toEqual([AUTH_MESSAGES.PASSWORD_LOWERCASE]);
  });

  it('reports the missing uppercase letter', () => {
    expect(messagesOf(passwordFieldSchema.safeParse('abcdef1!'))).toEqual([AUTH_MESSAGES.PASSWORD_UPPERCASE]);
  });

  it('reports the missing digit', () => {
    expect(messagesOf(passwordFieldSchema.safeParse('Abcdefg!'))).toEqual([AUTH_MESSAGES.PASSWORD_DIGIT]);
  });

  it('reports the missing special character', () => {
    expect(messagesOf(passwordFieldSchema.safeParse('Abcdef12'))).toEqual([AUTH_MESSAGES.PASSWORD_SPECIAL]);
  });

  it('reports every failing composition rule at once', () => {
    expect(messagesOf(passwordFieldSchema.safeParse('abcdef'))).toEqual([
      AUTH_MESSAGES.PASSWORD_UPPERCASE,
      AUTH_MESSAGES.PASSWORD_DIGIT,
      AUTH_MESSAGES.PASSWORD_SPECIAL,
    ]);
  });

  it('treats a space as a special character', () => {
    expect(passwordFieldSchema.safeParse('Abcdef 1').success).toBe(true);
  });

  it('maps the schema messages to the shared error constants', () => {
    expect(AUTH_MESSAGES.PASSWORD_MIN).toBe(ERROR_MESSAGES.AUTH_PASSWORD_MIN);
    expect(AUTH_MESSAGES.EMAIL_INVALID).toBe(ERROR_MESSAGES.AUTH_EMAIL_INVALID);
  });
});

describe('loginSchema', () => {
  it('accepts a valid email and password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'Abcdef1!' }).success).toBe(true);
  });

  it('rejects an empty email with the required message', () => {
    expect(messagesOf(loginSchema.safeParse({ email: '', password: 'Abcdef1!' }))).toContain(
      AUTH_MESSAGES.EMAIL_REQUIRED,
    );
  });

  it('rejects a malformed email with the invalid message', () => {
    expect(messagesOf(loginSchema.safeParse({ email: 'nope', password: 'Abcdef1!' }))).toContain(
      AUTH_MESSAGES.EMAIL_INVALID,
    );
  });

  it('rejects a missing email', () => {
    expect(messagesOf(loginSchema.safeParse({ password: 'Abcdef1!' }))).toContain(
      AUTH_MESSAGES.EMAIL_REQUIRED,
    );
  });

  it('rejects a body with no password field', () => {
    expect(messagesOf(loginSchema.safeParse({ email: 'a@b.co' }))).toContain(
      AUTH_MESSAGES.PASSWORD_REQUIRED,
    );
  });

  it('strips unknown keys rather than rejecting them', () => {
    const parsed = loginSchema.parse({ email: 'a@b.co', password: 'Abcdef1!', extra: 1 });
    expect(parsed).toEqual({ email: 'a@b.co', password: 'Abcdef1!' });
  });
});

describe('registerSchema', () => {
  const valid = {
    email: 'new@b.co',
    password: 'Abcdef1!',
    firstName: 'An',
    lastName: 'Nguyen',
  };

  it('accepts a complete registration without a username', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts an optional username', () => {
    expect(registerSchema.safeParse({ ...valid, username: 'an' }).success).toBe(true);
  });

  it('rejects an empty first name with the required message', () => {
    expect(messagesOf(registerSchema.safeParse({ ...valid, firstName: '' }))).toContain(
      AUTH_MESSAGES.FIRST_NAME_REQUIRED,
    );
  });

  it('rejects a first name longer than 25 characters', () => {
    expect(messagesOf(registerSchema.safeParse({ ...valid, firstName: 'x'.repeat(26) }))).toContain(
      AUTH_MESSAGES.FIRST_NAME_MAX,
    );
  });

  it('accepts a first name of exactly 25 characters', () => {
    expect(registerSchema.safeParse({ ...valid, firstName: 'x'.repeat(25) }).success).toBe(true);
  });

  it('rejects an empty last name with the required message', () => {
    expect(messagesOf(registerSchema.safeParse({ ...valid, lastName: '' }))).toContain(
      AUTH_MESSAGES.LAST_NAME_REQUIRED,
    );
  });

  it('rejects a last name longer than 25 characters', () => {
    expect(messagesOf(registerSchema.safeParse({ ...valid, lastName: 'x'.repeat(26) }))).toContain(
      AUTH_MESSAGES.LAST_NAME_MAX,
    );
  });

  it('rejects a non-string username with the username-required message', () => {
    expect(messagesOf(registerSchema.safeParse({ ...valid, username: 7 }))).toContain(
      AUTH_MESSAGES.USERNAME_REQUIRED,
    );
  });

  it('reports the weak-password issues from the shared password rules', () => {
    expect(messagesOf(registerSchema.safeParse({ ...valid, password: 'weak' }))).toContain(
      AUTH_MESSAGES.PASSWORD_MIN,
    );
  });
});

describe('loginByUserCodeSchema', () => {
  const valid = { userCode: 'ABC123', password: 'Abcdef1!', role: 'STUDENT' };

  it.each(['PARENT', 'STUDENT'])('accepts role %s', (role) => {
    expect(loginByUserCodeSchema.safeParse({ ...valid, role }).success).toBe(true);
  });

  it('rejects the TUTOR role for code login', () => {
    expect(loginByUserCodeSchema.safeParse({ ...valid, role: 'TUTOR' }).success).toBe(false);
  });

  it('rejects a userCode shorter than 6 characters', () => {
    expect(messagesOf(loginByUserCodeSchema.safeParse({ ...valid, userCode: 'ABC12' }))).toContain(
      ERROR_MESSAGES.AUTH_USER_CODE_LENGTH,
    );
  });

  it('rejects a userCode longer than 6 characters', () => {
    expect(messagesOf(loginByUserCodeSchema.safeParse({ ...valid, userCode: 'ABC1234' }))).toContain(
      ERROR_MESSAGES.AUTH_USER_CODE_LENGTH,
    );
  });

  it('rejects a missing userCode with the required message', () => {
    const { userCode: _omit, ...rest } = valid;
    expect(messagesOf(loginByUserCodeSchema.safeParse(rest))).toContain(
      ERROR_MESSAGES.AUTH_USER_CODE_REQUIRED,
    );
  });

  it('rejects a non-string userCode with the required message', () => {
    expect(messagesOf(loginByUserCodeSchema.safeParse({ ...valid, userCode: 123456 }))).toContain(
      ERROR_MESSAGES.AUTH_USER_CODE_REQUIRED,
    );
  });

  it('applies the password rules to the login password', () => {
    expect(messagesOf(loginByUserCodeSchema.safeParse({ ...valid, password: 'abc' }))).toContain(
      AUTH_MESSAGES.PASSWORD_MIN,
    );
  });
});

describe('refreshTokenBodySchema', () => {
  it('accepts a non-empty refresh token', () => {
    expect(refreshTokenBodySchema.safeParse({ refreshToken: 'r' }).success).toBe(true);
  });

  it('rejects an empty refresh token with the required message', () => {
    expect(messagesOf(refreshTokenBodySchema.safeParse({ refreshToken: '' }))).toContain(
      AUTH_MESSAGES.REFRESH_TOKEN_REQUIRED,
    );
  });

  it('rejects a missing refresh token with the required message', () => {
    expect(messagesOf(refreshTokenBodySchema.safeParse({}))).toContain(
      AUTH_MESSAGES.REFRESH_TOKEN_REQUIRED,
    );
  });
});

describe('forgotPasswordSchema', () => {
  it('accepts a valid email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'x@y.zz' }).success).toBe(true);
  });

  it('rejects an invalid email', () => {
    expect(messagesOf(forgotPasswordSchema.safeParse({ email: 'xyz' }))).toContain(
      AUTH_MESSAGES.EMAIL_INVALID,
    );
  });
});

describe('resetPasswordSchema', () => {
  const jti = '123e4567-e89b-42d3-a456-426614174000';
  const strong = 'Abcdef1!';

  it('accepts a matching password and confirmation', () => {
    expect(
      resetPasswordSchema.safeParse({ jti, password: strong, confirmPassword: strong }).success,
    ).toBe(true);
  });

  it('maps newPassword onto password when password is absent', () => {
    const parsed = resetPasswordSchema.parse({ jti, newPassword: strong, confirmPassword: strong });
    expect(parsed).toMatchObject({ password: strong });
  });

  it('prefers an explicit password over newPassword when both are sent', () => {
    const parsed = resetPasswordSchema.parse({
      jti,
      password: strong,
      newPassword: 'Zyxwvu9@',
      confirmPassword: strong,
    });
    expect(parsed.password).toBe(strong);
  });

  it('reports a confirmation mismatch on the confirmPassword path', () => {
    const result = resetPasswordSchema.safeParse({
      jti,
      password: strong,
      confirmPassword: 'Different1!',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual([
        expect.objectContaining({
          message: AUTH_MESSAGES.CONFIRM_PASSWORD_MISMATCH,
          path: ['confirmPassword'],
        }),
      ]);
    }
  });

  it('rejects a missing jti with the reset-token-required message', () => {
    expect(
      messagesOf(resetPasswordSchema.safeParse({ password: strong, confirmPassword: strong })),
    ).toContain(AUTH_MESSAGES.RESET_TOKEN_REQUIRED);
  });

  it('rejects a non-UUID jti with the reset-token-invalid message', () => {
    expect(
      messagesOf(
        resetPasswordSchema.safeParse({ jti: 'not-a-uuid', password: strong, confirmPassword: strong }),
      ),
    ).toContain(AUTH_MESSAGES.RESET_TOKEN_INVALID);
  });

  it('rejects a missing confirmation with the confirm-required message', () => {
    expect(messagesOf(resetPasswordSchema.safeParse({ jti, password: strong }))).toContain(
      AUTH_MESSAGES.CONFIRM_PASSWORD_REQUIRED,
    );
  });

  it('rejects a confirmation shorter than 6 characters', () => {
    expect(
      messagesOf(resetPasswordSchema.safeParse({ jti, password: strong, confirmPassword: 'abc' })),
    ).toContain(AUTH_MESSAGES.CONFIRM_PASSWORD_MIN);
  });

  it('rejects a confirmation longer than 25 characters', () => {
    expect(
      messagesOf(
        resetPasswordSchema.safeParse({ jti, password: strong, confirmPassword: 'x'.repeat(26) }),
      ),
    ).toContain(AUTH_MESSAGES.CONFIRM_PASSWORD_MAX);
  });

  it('leaves a non-object input unchanged and rejects it', () => {
    expect(resetPasswordSchema.safeParse('text').success).toBe(false);
    expect(resetPasswordSchema.safeParse(null).success).toBe(false);
  });

  it('does not rewrite an array body', () => {
    expect(resetPasswordSchema.safeParse([]).success).toBe(false);
  });
});
