import { translateMessage, toCodeMap, type TranslationDict } from 'src/data/i18n/translate';
import { ERROR_TRANSLATIONS } from 'src/data/i18n';
import { DEFAULT_LANGUAGE } from '@packages/guards/language.guard';

const dict: TranslationDict = {
  CLASS_NOT_FOUND: { vi: 'Không tìm thấy lớp', en: 'Class not found' },
  EN_ONLY: { vi: '', en: 'English only' },
};

describe('translateMessage', () => {
  it('localises an exact code match into the requested language', () => {
    expect(translateMessage(dict, 'CLASS_NOT_FOUND', 'en')).toBe('Class not found');
    expect(translateMessage(dict, 'CLASS_NOT_FOUND', 'vi')).toBe('Không tìm thấy lớp');
  });

  it('localises the code part of a composed "CODE: extra" message and keeps the suffix', () => {
    expect(translateMessage(dict, 'CLASS_NOT_FOUND: 42', 'en')).toBe('Class not found: 42');
  });

  it('keeps everything after the first ": " as the suffix', () => {
    expect(translateMessage(dict, 'CLASS_NOT_FOUND: a: b', 'en')).toBe('Class not found: a: b');
  });

  it('returns a plain unknown string untouched', () => {
    expect(translateMessage(dict, 'Something else', 'en')).toBe('Something else');
  });

  it('returns an unknown composed message untouched', () => {
    expect(translateMessage(dict, 'UNKNOWN_CODE: 1', 'en')).toBe('UNKNOWN_CODE: 1');
  });

  it('returns an empty string for undefined input', () => {
    expect(translateMessage(dict, undefined, 'en')).toBe('');
  });

  it('returns an empty string for an empty input', () => {
    expect(translateMessage(dict, '', 'vi')).toBe('');
  });

  it('returns the requested-language entry even when it is blank (no fallback for empty strings)', () => {
    expect(translateMessage(dict, 'EN_ONLY', 'vi')).toBe('');
  });

  it('uses the default language only when the requested translation is missing', () => {
    const partial = { Y: { vi: 'Mặc định', en: undefined } } as unknown as TranslationDict;
    expect(translateMessage(partial, 'Y', 'en')).toBe('Mặc định');
    expect(translateMessage(partial, 'Y', DEFAULT_LANGUAGE)).toBe('Mặc định');
  });

  it('does not match a code that is only a prefix of a dictionary key', () => {
    expect(translateMessage(dict, 'CLASS', 'en')).toBe('CLASS');
  });

  it('does not treat a leading ": " (separator at index 0) as a code', () => {
    expect(translateMessage(dict, ': CLASS_NOT_FOUND', 'en')).toBe(': CLASS_NOT_FOUND');
  });

  it('localises real entries from the shared error dictionary', () => {
    const [code] = Object.keys(ERROR_TRANSLATIONS);
    expect(translateMessage(ERROR_TRANSLATIONS, code, 'en')).toBe(ERROR_TRANSLATIONS[code].en);
    expect(translateMessage(ERROR_TRANSLATIONS, code, 'vi')).toBe(ERROR_TRANSLATIONS[code].vi);
  });
});

describe('toCodeMap', () => {
  it('maps each key of the dictionary to itself', () => {
    expect(toCodeMap(dict)).toEqual({ CLASS_NOT_FOUND: 'CLASS_NOT_FOUND', EN_ONLY: 'EN_ONLY' });
  });

  it('returns an empty map for an empty dictionary', () => {
    expect(toCodeMap({})).toEqual({});
  });
});
