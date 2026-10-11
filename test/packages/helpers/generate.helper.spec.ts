import { checkUuidValid, generateCode } from 'src/packages/helpers/generate.helper';

describe('generateCode', () => {
  it('defaults to 6 characters from A-Z0-9', () => {
    expect(generateCode()).toMatch(/^[A-Z0-9]{6}$/);
  });

  it('honours a custom length', () => {
    expect(generateCode(12)).toMatch(/^[A-Z0-9]{12}$/);
  });

  it('returns an empty string for length 0', () => {
    expect(generateCode(0)).toBe('');
  });
});

describe('checkUuidValid', () => {
  it('accepts a canonical v4 UUID', () => {
    expect(checkUuidValid({ data: '123e4567-e89b-42d3-a456-426614174000' })).toBe(true);
  });

  it('accepts uppercase input', () => {
    expect(checkUuidValid({ data: '123E4567-E89B-42D3-A456-426614174000' })).toBe(true);
  });

  it.each([
    ['empty string', ''],
    ['missing hyphens', '123e4567e89b42d3a456426614174000'],
    ['version 0', '123e4567-e89b-02d3-a456-426614174000'],
    ['wrong variant nibble', '123e4567-e89b-42d3-c456-426614174000'],
    ['non-hex character', '123e4567-e89b-42d3-a456-42661417400g'],
  ])('rejects %s', (_label, data) => {
    expect(checkUuidValid({ data })).toBe(false);
  });
});
