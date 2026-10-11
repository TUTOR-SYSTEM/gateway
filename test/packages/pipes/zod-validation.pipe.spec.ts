import { UnprocessableEntityException } from '@nestjs/common';
import { z } from 'zod';
import { ERROR_MESSAGES } from 'src/data/constants';
import { ZodValidationPipe } from 'src/packages/pipes/zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const schema = z.object({
    name: z.string().min(1),
    age: z.number().int().positive(),
    address: z.object({ city: z.string() }),
  });

  it('returns the parsed data for a valid value', () => {
    const pipe = new ZodValidationPipe(schema);
    const value = { name: 'An', age: 12, address: { city: 'Hà Nội' } };
    expect(pipe.transform(value)).toEqual(value);
  });

  it('parses a JSON string before validating (multipart form fields)', () => {
    const pipe = new ZodValidationPipe(schema);
    const raw = JSON.stringify({ name: 'An', age: 12, address: { city: 'HN' } });
    expect(pipe.transform(raw)).toEqual({ name: 'An', age: 12, address: { city: 'HN' } });
  });

  it('keeps a string that is not valid JSON unchanged', () => {
    const pipe = new ZodValidationPipe(z.string().min(3));
    expect(pipe.transform('{ab')).toBe('{ab');
  });

  it('throws UnprocessableEntityException with one error per field', () => {
    const pipe = new ZodValidationPipe(schema);
    let caught: unknown;
    try {
      pipe.transform({ name: '', age: -1, address: { city: 1 } });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(UnprocessableEntityException);
    const body = (caught as UnprocessableEntityException).getResponse() as {
      statusCode: number;
      message: string;
      errors: { field: string; message: string; code: string }[];
    };
    expect(body.statusCode).toBe(422);
    expect(body.message).toBe(ERROR_MESSAGES.VALIDATION_FAILED);
    expect(body.errors.map((e) => e.field)).toEqual(['name', 'age', 'address.city']);
    expect(body.errors[0]).toEqual(
      expect.objectContaining({ field: 'name', code: 'too_small' }),
    );
  });

  it('reports only the first issue for a field that fails several rules', () => {
    const pipe = new ZodValidationPipe(z.object({ code: z.string().min(5).regex(/^\d+$/) }));
    let caught: unknown;
    try {
      pipe.transform({ code: 'a' });
    } catch (e) {
      caught = e;
    }
    const body = (caught as UnprocessableEntityException).getResponse() as {
      errors: { field: string }[];
    };
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].field).toBe('code');
  });

  it('uses an empty field name for root-level issues', () => {
    const pipe = new ZodValidationPipe(z.string().min(3));
    let caught: unknown;
    try {
      pipe.transform('a');
    } catch (e) {
      caught = e;
    }
    const body = (caught as UnprocessableEntityException).getResponse() as {
      errors: { field: string }[];
    };
    expect(body.errors[0].field).toBe('');
  });
});
