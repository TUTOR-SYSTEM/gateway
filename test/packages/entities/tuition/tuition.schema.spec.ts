import { UnprocessableEntityException } from '@nestjs/common';
import { getTuitionSummaryQuerySchema } from '@packages/entities/tuition';
import { ZodValidationPipe } from '@packages/pipes';

describe('getTuitionSummaryQuerySchema', () => {
  const pipe = new ZodValidationPipe(getTuitionSummaryQuerySchema);
  const CLASS_ID = '3f0c1c2e-5b7a-4c1d-9a55-0d6f0f7a9b11';

  it('accepts an empty query', () => {
    expect(pipe.transform({})).toEqual({});
  });

  it('accepts a uuid classId', () => {
    expect(pipe.transform({ classId: CLASS_ID })).toEqual({ classId: CLASS_ID });
  });

  it('rejects a non-uuid classId', () => {
    expect(() => pipe.transform({ classId: 'abc' })).toThrow(UnprocessableEntityException);
  });
});
