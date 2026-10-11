import { ExecutionContext } from '@nestjs/common';
import { DEFAULT_LANGUAGE, LanguageGuard } from 'src/packages/guards/language.guard';

function run(header?: string) {
  const request: { headers: Record<string, string | undefined>; language?: string } = {
    headers: { 'accept-language': header },
  };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  const result = new LanguageGuard().canActivate(ctx);
  return { result, language: request.language };
}

describe('LanguageGuard', () => {
  it('always lets the request through', () => {
    expect(run('en').result).toBe(true);
  });

  it('defaults to vi when the header is missing', () => {
    expect(run(undefined).language).toBe(DEFAULT_LANGUAGE);
    expect(DEFAULT_LANGUAGE).toBe('vi');
  });

  it('picks a supported primary tag from a region-qualified tag', () => {
    expect(run('en-US').language).toBe('en');
  });

  it('respects quality weights when ranking languages', () => {
    expect(run('vi;q=0.4,en;q=0.9').language).toBe('en');
  });

  it('falls back to default when no supported language is listed', () => {
    expect(run('fr-FR,de;q=0.8').language).toBe(DEFAULT_LANGUAGE);
  });

  it('treats an unparseable q value as weight 0', () => {
    expect(run('en;q=abc,vi;q=0.1').language).toBe('vi');
  });
});
