import { Controller, ForbiddenException, Get, HttpCode, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiResponse as SwaggerResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { StatusCodes } from 'http-status-codes';
import { Roles } from '@packages/decorators';
import { RolesGuard } from '@packages/guards';
import { ZodValidationPipe } from '@packages/pipes';
import { ERROR_MESSAGES } from '../../data/constants';
import { getRedisQuerySchema, type GetRedisQueryDto } from '@packages/entities/redis';
import { RmqProducer } from '../rabbitmq/rmq.producer';

/** Key prefixes holding sessions / refresh / reset tokens — never readable over HTTP. */
const SENSITIVE_KEY_PREFIXES = [
  'session:',
  'login-session:',
  'reset-password:',
  'refresh:',
  'refresh-token:',
];

/**
 * Gateway is a thin HTTP edge for `redis`: validation/guards/Swagger stay, the handler forwards
 * to the `third-service` over RabbitMQ via `RmqProducer.send()`.
 */
@ApiTags('Redis')
@ApiBearerAuth('access-token')
@UseGuards(RolesGuard)
@Roles('ADMIN')
@Controller('redis')
export class RedisController {
  constructor(private readonly rmqProducer: RmqProducer) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Get Redis value', description: 'Retrieve a value from Redis by key' })
  @ApiQuery({ name: 'key', required: true, type: String, description: 'Redis key' })
  @SwaggerResponse({ status: 200, description: 'Value retrieved (null if key does not exist)' })
  get(
    @Query(new ZodValidationPipe<GetRedisQueryDto>(getRedisQuerySchema)) query: GetRedisQueryDto,
  ) {
    const lowered = query.key.toLowerCase();
    if (SENSITIVE_KEY_PREFIXES.some((prefix) => lowered.startsWith(prefix))) {
      throw new ForbiddenException(ERROR_MESSAGES.PERMISSION_DENIED);
    }
    return this.rmqProducer.send('redis.get', { key: query.key });
  }
}
