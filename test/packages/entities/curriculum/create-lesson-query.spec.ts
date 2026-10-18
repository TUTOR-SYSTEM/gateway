import { UnprocessableEntityException } from '@nestjs/common';
import { createLessonQuerySchema } from '@packages/entities/curriculum';
import { ZodValidationPipe } from '@packages/pipes';

describe('createLessonQuerySchema', () => {
  const pipe = new ZodValidationPipe(createLessonQuerySchema);
  const CURRICULUM_ID = '3f0c1c2e-5b7a-4c1d-9a55-0d6f0f7a9b11';
  const CHAPTER_ID = '8a1e2b3c-4d5f-4a6b-8c7d-9e0f1a2b3c4d';

  it('accepts curriculumId alone', () => {
    expect(pipe.transform({ curriculumId: CURRICULUM_ID })).toEqual({
      curriculumId: CURRICULUM_ID,
    });
  });

  it('accepts curriculumId with chapterId', () => {
    expect(pipe.transform({ curriculumId: CURRICULUM_ID, chapterId: CHAPTER_ID })).toEqual({
      curriculumId: CURRICULUM_ID,
      chapterId: CHAPTER_ID,
    });
  });

  it('rejects a missing curriculumId', () => {
    expect(() => pipe.transform({})).toThrow(UnprocessableEntityException);
  });

  it('rejects non-uuid curriculumId or chapterId', () => {
    expect(() => pipe.transform({ curriculumId: 'x' })).toThrow(UnprocessableEntityException);
    expect(() => pipe.transform({ curriculumId: CURRICULUM_ID, chapterId: 'x' })).toThrow(
      UnprocessableEntityException,
    );
  });
});
