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
import { CurrentUser } from '@packages/decorators';
import {
  createCurriculumSchema,
  getCurriculumsQuerySchema,
  updateCurriculumSchema,
  type CreateCurriculumDto,
  type GetCurriculumsQueryDto,
  type UpdateCurriculumDto,
} from '@packages/entities/curriculum';
import type { JwtGuardUser } from '@packages/guards/jwt-auth.guard';
import { RmqProducer } from '../rabbitmq/rmq.producer';

/**
 * Gateway is a thin HTTP edge for `curriculum`: validation/guards/Swagger stay, every handler
 * forwards to the `tutor-service` over RabbitMQ via `RmqProducer.send()`.
 */
@ApiTags('Curriculum')
@ApiBearerAuth('access-token')
@Controller('curriculum')
export class CurriculumController {
  constructor(private readonly rmqProducer: RmqProducer) {}

  @Get('generate-code')
  @HttpCode(StatusCodes.CREATED)
  @ApiOperation({ summary: 'Generate curriculum code' })
  @SwaggerResponse({ status: 201, description: 'Curriculum code generated' })
  generateCode() {
    return this.rmqProducer.send('curriculum.generateCode', {});
  }

  @Post()
  @HttpCode(StatusCodes.CREATED)
  @ApiOperation({ summary: 'Create curriculum' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['subject', 'code', 'grade'],
      properties: {
        subject: { type: 'string', example: 'Đại Số' },
        code: { type: 'string', example: 'FDV643' },
        grade: { type: 'string', example: '12' },
        courseTime: { type: 'string', example: '12 buổi' },
        description: { type: 'string', example: '' },
        gradesId: { type: 'string', format: 'uuid' },
      },
    },
  })
  @SwaggerResponse({ status: 201, description: 'Curriculum created' })
  create(
    @Body(new ZodValidationPipe<CreateCurriculumDto>(createCurriculumSchema))
    _dto: CreateCurriculumDto,
    @CurrentUser() _user: JwtGuardUser,
  ) {
    return this.rmqProducer.send('curriculum.create', { userId: _user.id, ..._dto });
  }

  @Get()
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Get all curriculum' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by subject or code' })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Curriculum list fetched' })
  getAll(
    @Query(new ZodValidationPipe<GetCurriculumsQueryDto>(getCurriculumsQuerySchema))
    _query: GetCurriculumsQueryDto,
    @CurrentUser() _user: JwtGuardUser,
  ) {
    return this.rmqProducer.send('curriculum.getAll', { userId: _user.id, ..._query });
  }

  @Get(':id')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Get curriculum by id' })
  @ApiParam({ name: 'id', description: 'Curriculum ID', type: 'string' })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Curriculum detail fetched' })
  getById(@Param('id') _id: string, @CurrentUser() _user: JwtGuardUser) {
    return this.rmqProducer.send('curriculum.getById', { userId: _user.id, id: _id });
  }

  @Put(':id')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Update curriculum' })
  @ApiParam({ name: 'id', description: 'Curriculum ID', type: 'string' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        subject: { type: 'string', example: 'Đại Số' },
        code: { type: 'string', example: 'FDV643' },
        grade: { type: 'string', example: '12' },
        description: { type: 'string', example: '' },
      },
    },
  })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Curriculum updated' })
  update(
    @Param('id') _id: string,
    @Body(new ZodValidationPipe<UpdateCurriculumDto>(updateCurriculumSchema))
    _dto: UpdateCurriculumDto,
    @CurrentUser() _user: JwtGuardUser,
  ) {
    return this.rmqProducer.send('curriculum.update', { userId: _user.id, id: _id, data: _dto });
  }

  @Delete(':id')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Delete curriculum' })
  @ApiParam({ name: 'id', description: 'Curriculum ID', type: 'string' })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Curriculum deleted' })
  delete(@Param('id') _id: string, @CurrentUser() _user: JwtGuardUser) {
    return this.rmqProducer.send('curriculum.delete', { userId: _user.id, id: _id });
  }
}