import { decodeMulterFilename } from 'src/packages/helpers/file.helper';

describe('decodeMulterFilename', () => {
  it('recovers UTF-8 Vietnamese diacritics from a latin1-decoded multipart name', () => {
    const mojibake = Buffer.from('Bài giảng.pdf', 'utf8').toString('latin1');
    expect(decodeMulterFilename(mojibake)).toBe('Bài giảng.pdf');
  });

  it('passes pure ASCII names through unchanged', () => {
    expect(decodeMulterFilename('report-2026.pdf')).toBe('report-2026.pdf');
  });

  it('returns an empty string for an empty name', () => {
    expect(decodeMulterFilename('')).toBe('');
  });

  it('round-trips a multi-byte emoji name', () => {
    const mojibake = Buffer.from('🎓 lớp.png', 'utf8').toString('latin1');
    expect(decodeMulterFilename(mojibake)).toBe('🎓 lớp.png');
  });
});
