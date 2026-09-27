import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiQuery,
  ApiParam,
  ApiResponse as SwaggerResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { StatusCodes } from 'http-status-codes';
import { ZodValidationPipe } from '@packages/pipes';
import {
  createLessonBodySchema,
  getLessonsQuerySchema,
  updateLessonSchema,
  type CreateLessonBodyDto,
  type GetLessonsQueryDto,
  type UpdateLessonDto,
} from '@packages/entities/curriculum';
import { RmqProducer } from '../rabbitmq/rmq.producer';

/**
 * Gateway is a thin HTTP edge for `lesson`: validation/guards/Swagger stay, every handler
 * forwards to the `tutor-service` over RabbitMQ via `RmqProducer.send()`.
 */
@ApiTags('Lesson')
@ApiBearerAuth('access-token')
@Controller('curriculum/lessons')
export class LessonController {
  constructor(private readonly rmqProducer: RmqProducer) {}

  @Post()
  @HttpCode(StatusCodes.CREATED)
  @ApiOperation({ summary: 'Create lesson', description: 'Create a new lesson' })
  @ApiQuery({ name: 'curriculumId', description: 'Curriculum ID', type: 'string' })
  @ApiQuery({ name: 'chapterId', description: 'Chapter ID (optional)', type: 'string', required: false })
  @ApiBody({ schema: { type: 'object', required: ['title'] } })
  @SwaggerResponse({ status: 201, description: 'Lesson created' })
  create(
    @Query('curriculumId') _curriculumId: string,
    @Query('chapterId') _chapterId: string | undefined,
    @Body(new ZodValidationPipe<CreateLessonBodyDto>(createLessonBodySchema))
    _data: CreateLessonBodyDto,
  ) {
    return this.rmqProducer.send('lesson.create', { curriculumId: _curriculumId, chapterId: _chapterId, data: _data });
  }

  @Get()
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    summary: 'Get all lessons',
    description: 'Get lessons filtered by curriculumId and optionally chapterId',
  })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Lessons fetched' })
  getAll(
    @Query(new ZodValidationPipe<GetLessonsQueryDto>(getLessonsQuerySchema))
    _query: GetLessonsQueryDto,
  ) {
    return this.rmqProducer.send('lesson.getAll', { query: _query });
  }

  @Get(':id')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Get lesson by id' })
  @ApiParam({ name: 'id', description: 'Lesson ID', type: 'string' })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Lesson fetched' })
  getById(@Param('id') _id: string) {
    return this.rmqProducer.send('lesson.getById', { id: _id });
  }

  @Put(':id')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Update lesson' })
  @ApiParam({ name: 'id', description: 'Lesson ID', type: 'string' })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Lesson updated' })
  update(
    @Param('id') _id: string,
    @Body(new ZodValidationPipe<UpdateLessonDto>(updateLessonSchema))
    _data: UpdateLessonDto,
  ) {
    return this.rmqProducer.send('lesson.update', { id: _id, data: _data });
  }

  @Delete(':id')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Delete lesson' })
  @ApiParam({ name: 'id', description: 'Lesson ID', type: 'string' })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Lesson deleted' })
  delete(@Param('id') _id: string) {
    return this.rmqProducer.send('lesson.delete', { id: _id });
  }
}