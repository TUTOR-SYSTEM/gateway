import { ConfigService } from '@nestjs/config';
import { validateRequiredEnvs } from 'src/packages/helpers/checkEnv.helper';

function config(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('validateRequiredEnvs', () => {
  it('returns true when every required env is set', () => {
    expect(validateRequiredEnvs(config({ A: 'x', B: 'y' }), ['A', 'B'])).toBe(true);
  });

  it('lists every missing env in the thrown error', () => {
    expect(() => validateRequiredEnvs(config({ A: 'x' }), ['A', 'B', 'C'])).toThrow(
      'Missing required environment variables:\n- B\n- C',
    );
  });

  it('treats blank and whitespace-only values as missing', () => {
    expect(() => validateRequiredEnvs(config({ A: '   ', B: '' }), ['A', 'B'])).toThrow(
      /- A\n- B/,
    );
  });
});
