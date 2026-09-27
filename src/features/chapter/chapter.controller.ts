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
  createChapterSchema,
  getChaptersQuerySchema,
  updateChapterSchema,
  type CreateChapterDto,
  type GetChaptersQueryDto,
  type UpdateChapterDto,
} from '@packages/entities/curriculum';
import { RmqProducer } from '../rabbitmq/rmq.producer';

/**
 * Gateway is a thin HTTP edge for `chapter`: validation/guards/Swagger stay, every handler
 * forwards to the `tutor-service` over RabbitMQ via `RmqProducer.send()`.
 */
@ApiTags('Chapter')
@ApiBearerAuth('access-token')
@Controller('chapter')
export class ChapterController {
  constructor(private readonly rmqProducer: RmqProducer) {}

  @Post(':curriculumId')
  @HttpCode(StatusCodes.CREATED)
  @ApiOperation({ summary: 'Create chapter', description: 'Create a new chapter for a curriculum' })
  @ApiParam({ name: 'curriculumId', description: 'Curriculum ID', type: 'string' })
  @ApiBody({ schema: { type: 'object', required: ['title'] } })
  @SwaggerResponse({ status: 201, description: 'Chapter created' })
  create(
    @Param('curriculumId') _curriculumId: string,
    @Body(new ZodValidationPipe<CreateChapterDto>(createChapterSchema))
    _data: CreateChapterDto,
  ) {
    return this.rmqProducer.send('chapter.create', { curriculumId: _curriculumId, data: _data });
  }

  @Get()
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Get all chapters', description: 'Get all chapters for a curriculum' })
  @ApiQuery({ name: 'curriculumId', description: 'Curriculum ID', type: 'string', required: true })
  @ApiQuery({ name: 'page', description: 'Page number', type: 'number', required: false })
  @ApiQuery({ name: 'limit', description: 'Items per page', type: 'number', required: false })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Chapters fetched' })
  getAll(
    @Query(new ZodValidationPipe<GetChaptersQueryDto>(getChaptersQuerySchema))
    _query: GetChaptersQueryDto,
  ) {
    return this.rmqProducer.send('chapter.getAll', { query: _query });
  }

  @Get(':id')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Get chapter by id' })
  @ApiParam({ name: 'id', description: 'Chapter ID', type: 'string' })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Chapter fetched' })
  getById(@Param('id') _id: string) {
    return this.rmqProducer.send('chapter.getById', { id: _id });
  }

  @Put(':id')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Update chapter' })
  @ApiParam({ name: 'id', description: 'Chapter ID', type: 'string' })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Chapter updated' })
  update(
    @Param('id') _id: string,
    @Body(new ZodValidationPipe<UpdateChapterDto>(updateChapterSchema))
    _data: UpdateChapterDto,
  ) {
    return this.rmqProducer.send('chapter.update', { id: _id, data: _data });
  }

  @Delete(':id')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Delete chapter' })
  @ApiParam({ name: 'id', description: 'Chapter ID', type: 'string' })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Chapter deleted' })
  delete(@Param('id') _id: string) {
    return this.rmqProducer.send('chapter.delete', { id: _id });
  }
}