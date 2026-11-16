import { Module } from '@nestjs/common';
import { CourseProgressController } from './course-progress.controller';

@Module({
  controllers: [CourseProgressController],
})
export class CourseProgressModule {}
