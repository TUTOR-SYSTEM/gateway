import type { ExecutionContext } from '@nestjs/common';
import { currentUserFactory } from 'src/packages/decorators/user.decorator';
import { languageFactory } from 'src/packages/decorators/language.decorator';
import { DEFAULT_LANGUAGE } from '@packages/guards/language.guard';

function ctxWith(request: object): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('currentUserFactory', () => {
  const user = { id: 'u1', email: 'a@b.c', role: 'ADMIN' };

  it('returns the whole user when no key is requested', () => {
    expect(currentUserFactory(undefined, ctxWith({ user }))).toEqual(user);
  });

  it('returns a single claim when a key is requested', () => {
    expect(currentUserFactory('role', ctxWith({ user }))).toBe('ADMIN');
  });

  it('returns undefined for a key missing from the payload', () => {
    expect(currentUserFactory('role', ctxWith({ user: { id: 'x' } }))).toBeUndefined();
  });

  it('returns undefined for the whole user when the request is anonymous', () => {
    expect(currentUserFactory(undefined, ctxWith({}))).toBeUndefined();
  });

  it('returns undefined for a claim on an anonymous request', () => {
    expect(currentUserFactory('id', ctxWith({}))).toBeUndefined();
  });
});

describe('languageFactory', () => {
  it('returns the language set by the LanguageGuard', () => {
    expect(languageFactory(undefined, ctxWith({ language: 'en' }))).toBe('en');
  });

  it('falls back to the default language when the guard did not run', () => {
    expect(languageFactory(undefined, ctxWith({}))).toBe(DEFAULT_LANGUAGE);
  });

  it('ignores the decorator data argument', () => {
    expect(languageFactory('anything', ctxWith({ language: 'vi' }))).toBe('vi');
  });
});
