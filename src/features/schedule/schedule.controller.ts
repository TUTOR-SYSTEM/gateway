import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
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
  createScheduleSchema,
  createSchedulesSchema,
  getSchedulesSchema,
  updateScheduleSchema,
  type CreateScheduleDto,
  type CreateSchedulesDto,
  type GetSchedulesQueryDto,
  type UpdateScheduleDto,
} from '@packages/entities/schedule';
import type { JwtGuardUser } from '@packages/guards/jwt-auth.guard';
import { RmqProducer } from '../rabbitmq/rmq.producer';

/**
 * Gateway is a thin HTTP edge for `schedules`: validation/guards/Swagger stay, every handler
 * forwards to the `tutor-service` over RabbitMQ via `RmqProducer.send()`.
 */
@ApiTags('Schedules')
@ApiBearerAuth('access-token')
@Controller('schedules')
export class ScheduleController {
  constructor(private readonly rmqProducer: RmqProducer) {}

  @Post()
  @HttpCode(StatusCodes.CREATED)
  @ApiOperation({ summary: 'Create schedule', description: 'Create a single weekly class slot' })
  @ApiBody({ schema: { type: 'object', required: ['classId', 'dayOfWeek', 'startTime', 'endTime'] } })
  @SwaggerResponse({ status: 201, description: 'Schedule created' })
  create(
    @Body(new ZodValidationPipe<CreateScheduleDto>(createScheduleSchema))
    dto: CreateScheduleDto,
    @CurrentUser() user: JwtGuardUser,
  ) {
    return this.rmqProducer.send('schedule.create', { userId: user.id, ...dto });
  }

  @Post('bulk')
  @HttpCode(StatusCodes.CREATED)
  @ApiOperation({ summary: 'Create schedules (bulk)', description: 'Create 1-7 weekly class slots at once' })
  @SwaggerResponse({ status: 201, description: 'Schedules created' })
  createBulk(
    @Body(new ZodValidationPipe<CreateSchedulesDto>(createSchedulesSchema))
    dto: CreateSchedulesDto,
    @CurrentUser() user: JwtGuardUser,
  ) {
    return this.rmqProducer.send('schedule.createBulk', { userId: user.id, ...dto });
  }

  @Get()
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    summary: 'Get schedules',
    description: 'List schedules across the classes the current user owns or is enrolled in',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'classId', required: false, type: String, format: 'uuid' })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Schedules fetched' })
  getAll(
    @Query(new ZodValidationPipe<GetSchedulesQueryDto>(getSchedulesSchema))
    query: GetSchedulesQueryDto,
    @CurrentUser() user: JwtGuardUser,
  ) {
    return this.rmqProducer.send('schedule.getAll', { userId: user.id, ...query });
  }

  @Get('class/:classId')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Get schedules by class' })
  @ApiParam({ name: 'classId', type: String, format: 'uuid' })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Schedules fetched' })
  getByClass(@Param('classId') classId: string, @CurrentUser() user: JwtGuardUser) {
    return this.rmqProducer.send('schedule.getByClass', { userId: user.id, classId });
  }

  @Get(':id')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Get schedule detail' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Schedule fetched' })
  getById(@Param('id') id: string, @CurrentUser() user: JwtGuardUser) {
    return this.rmqProducer.send('schedule.getById', { userId: user.id, id });
  }

  @Patch(':id')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Update schedule' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Schedule updated' })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe<UpdateScheduleDto>(updateScheduleSchema))
    dto: UpdateScheduleDto,
    @CurrentUser() user: JwtGuardUser,
  ) {
    return this.rmqProducer.send('schedule.update', { userId: user.id, id, ...dto });
  }

  @Delete(':id')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Delete schedule' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Schedule deleted' })
  del(@Param('id') id: string, @CurrentUser() user: JwtGuardUser) {
    return this.rmqProducer.send('schedule.delete', { userId: user.id, id });
  }
}