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
  createTuitionSchema,
  getTuitionsQuerySchema,
  updateTuitionSchema,
  type CreateTuitionDto,
  type GetTuitionsQueryDto,
  type UpdateTuitionDto,
} from '@packages/entities/tuition';
import type { JwtGuardUser } from '@packages/guards/jwt-auth.guard';
import { RmqProducer } from '../rabbitmq/rmq.producer';

/**
 * Gateway is a thin HTTP edge for `tuitions`: validation/guards/Swagger stay, every handler
 * forwards to the `tutor-service` over RabbitMQ via `RmqProducer.send()`.
 */
@ApiTags('Tuitions')
@ApiBearerAuth('access-token')
@Controller('tuitions')
export class TuitionController {
  constructor(private readonly rmqProducer: RmqProducer) {}

  @Post()
  @HttpCode(StatusCodes.CREATED)
  @ApiOperation({ summary: 'Create tuition record' })
  @ApiBody({ schema: { type: 'object', required: ['classId', 'studentId', 'amount'] } })
  @SwaggerResponse({ status: 201, description: 'Tuition record created' })
  create(
    @Body(new ZodValidationPipe<CreateTuitionDto>(createTuitionSchema))
    dto: CreateTuitionDto,
    @CurrentUser() user: JwtGuardUser,
  ) {
    return this.rmqProducer.send('tuition.create', { userId: user.id, data: dto });
  }

  @Get('summary')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    summary: 'Tuition summary',
    description: 'Get revenue summary (total paid/unpaid/overdue/revenue)',
  })
  @ApiQuery({ name: 'classId', required: false, type: String, format: 'uuid' })
  @SwaggerResponse({ status: 200, description: 'Summary fetched' })
  getSummary(@Query('classId') classId?: string) {
    return this.rmqProducer.send('tuition.getSummary', { classId });
  }

  @Get()
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'List tuition records' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'classId', required: false, type: String, format: 'uuid' })
  @ApiQuery({ name: 'studentId', required: false, type: String, format: 'uuid' })
  @ApiQuery({ name: 'status', required: false, enum: ['PAID', 'UNPAID', 'OVERDUE'] })
  @SwaggerResponse({ status: 200, description: 'Tuitions fetched' })
  getAll(
    @Query(new ZodValidationPipe<GetTuitionsQueryDto>(getTuitionsQuerySchema))
    query: GetTuitionsQueryDto,
  ) {
    return this.rmqProducer.send('tuition.getAll', { query });
  }

  @Get(':id')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Get tuition detail' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @SwaggerResponse({ status: 200, description: 'Tuition detail' })
  getById(@Param('id') id: string) {
    return this.rmqProducer.send('tuition.getById', { id });
  }

  @Put(':id')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Update tuition record' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @SwaggerResponse({ status: 200, description: 'Tuition updated' })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTuitionSchema))
    dto: UpdateTuitionDto,
    @CurrentUser() user: JwtGuardUser,
  ) {
    return this.rmqProducer.send('tuition.update', { userId: user.id, id, data: dto });
  }

  @Delete(':id')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Delete tuition record' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @SwaggerResponse({ status: 200, description: 'Tuition deleted' })
  delete(@Param('id') id: string, @CurrentUser() user: JwtGuardUser) {
    return this.rmqProducer.send('tuition.delete', { userId: user.id, id });
  }
}
