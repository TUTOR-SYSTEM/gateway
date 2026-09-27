import { Controller, Get, HttpCode, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiResponse as SwaggerResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { StatusCodes } from 'http-status-codes';
import { ZodValidationPipe } from '@packages/pipes';
import { getRedisQuerySchema, type GetRedisQueryDto } from '@packages/entities/redis';
import { RmqProducer } from '../rabbitmq/rmq.producer';

/**
 * Gateway is a thin HTTP edge for `redis`: validation/guards/Swagger stay, the handler forwards
 * to the `third-service` over RabbitMQ via `RmqProducer.send()`.
 */
@ApiTags('Redis')
@ApiBearerAuth('access-token')
@Controller('redis')
export class RedisController {
  constructor(private readonly rmqProducer: RmqProducer) {}

  @Get()
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Get Redis value', description: 'Retrieve a value from Redis by key' })
  @ApiQuery({ name: 'key', required: true, type: String, description: 'Redis key' })
  @SwaggerResponse({ status: 200, description: 'Value retrieved (null if key does not exist)' })
  get(
    @Query(new ZodValidationPipe<GetRedisQueryDto>(getRedisQuerySchema)) query: GetRedisQueryDto,
  ) {
    return this.rmqProducer.send('redis.get', { key: query.key });
  }
}
