import { Controller, Get, HttpCode, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiParam,
  ApiResponse as SwaggerResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { StatusCodes } from 'http-status-codes';
import { Roles } from '@packages/decorators';
import { RolesGuard } from '@packages/guards';
import { ZodValidationPipe } from '@packages/pipes';
import { getRequestLogsQuerySchema, type GetRequestLogsQueryDto } from '@packages/entities/log';
import { RmqProducer } from '../rabbitmq/rmq.producer';

/**
 * Thin proxy onto third-service's centralized `request_logs` table (admin only): lets an
 * operator check requests handled by every microservice from one place.
 */
@ApiTags('Logs')
@ApiBearerAuth('access-token')
@UseGuards(RolesGuard)
@Roles('ADMIN')
@Controller('logs')
export class LogController {
  constructor(private readonly rmqProducer: RmqProducer) {}

  @Get()
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'List request logs across all services (admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'serviceName', required: false, type: String, example: 'gateway' })
  @ApiQuery({ name: 'type', required: false, enum: ['HTTP', 'RPC'] })
  @ApiQuery({ name: 'correlationId', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by path' })
  @SwaggerResponse({ status: 200, description: 'Request logs fetched' })
  findAll(
    @Query(new ZodValidationPipe<GetRequestLogsQueryDto>(getRequestLogsQuerySchema))
    query: GetRequestLogsQueryDto,
  ) {
    return this.rmqProducer.send('log.query', query);
  }

  @Get('trace/:correlationId')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    summary: 'Trace one request across every service',
    description: 'Every log row sharing the same correlationId, ordered by when it happened.',
  })
  @ApiParam({ name: 'correlationId', type: String })
  @SwaggerResponse({ status: 200, description: 'Trace fetched' })
  trace(@Param('correlationId') correlationId: string) {
    return this.rmqProducer.send('log.trace', { correlationId });
  }
}
