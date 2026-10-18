import { UnprocessableEntityException } from '@nestjs/common';
import { gradeExerciseSchema } from '@packages/entities/exercise';
import { ZodValidationPipe } from '@packages/pipes';

describe('gradeExerciseSchema score', () => {
  const pipe = new ZodValidationPipe(gradeExerciseSchema);

  it.each([0, 7, 10, 7.5])('accepts numeric score %p', (score) => {
    expect(pipe.transform({ score })).toEqual({ score });
  });

  it.each([
    ['""', ''],
    ['null', null],
    ['"7"', '7'],
    ['undefined', undefined],
  ])('rejects non-number score %s', (_label, score) => {
    expect(() => pipe.transform({ score })).toThrow(UnprocessableEntityException);
  });

  it('rejects out-of-range scores', () => {
    expect(() => pipe.transform({ score: -1 })).toThrow(UnprocessableEntityException);
    expect(() => pipe.transform({ score: 10.5 })).toThrow(UnprocessableEntityException);
  });
});
