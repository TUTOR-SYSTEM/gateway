import { Controller, Get, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse as SwaggerResponse } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Public } from '@packages/decorators';
import { RmqProducer } from './features/rabbitmq/rmq.producer';

@ApiTags('Health')
@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);
  constructor(
    private readonly appService: AppService,
    private readonly rmqProducer: RmqProducer,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Health check', description: 'Returns a simple health check response' })
  @SwaggerResponse({
    status: 200,
    description: 'Server is running',
    schema: { type: 'string', example: 'Hello World!' },
  })
  getHello(): string {
    return this.appService.getHello();
  }

  @Public()
  @Get('kafka/emit')
  @ApiOperation({
    summary: 'RabbitMQ emit health check',
    description: 'Fire-and-forget ping to the user service over RabbitMQ — no reply is awaited',
  })
  @SwaggerResponse({
    status: 200,
    description: 'Ping emitted',
    schema: { type: 'string', example: 'Hello World!' },
  })
  async pingMsgFromKafkaController(): Promise<unknown> {
    this.logger.log(`[EMIT] kafka.emit -> user, payload=123`);
    return await this.rmqProducer.emit<unknown, number>('kafka.ping', 123);
  }

  @Public()
  @Get('kafka/send')
  @ApiOperation({
    summary: 'RabbitMQ send user data with response',
    description: 'Send user data to user service over RabbitMQ and receive response',
  })
  @SwaggerResponse({
    status: 200,
    description: 'Data sent and response received',
    schema: {
      type: 'object',
      example: {
        statusCode: 200,
        message: 'Success',
        data: {
          userId: 'uuid',
          email: 'test@example.com',
          fullName: 'Test User',
          role: 'STUDENT',
          requestId: '1790476104884-tye8k',
          duration: 3,
        },
        timestamp: '2026-09-27T02:28:24.887Z',
        method: 'GET',
        path: '/kafka/send',
        correlationId: 'f9f4c634-219e-4903-8e17-552e130a5faf',
      },
    },
  })
  async sendMsgFromKafkaController(): Promise<unknown> {
    const requestId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const startTime = Date.now();
    const payload = {
      email: 'test.kafka@example.com',
      firstName: 'Kafka',
      lastName: 'Test',
      username: 'kafka_test_user',
      role: 'STUDENT',
      timestamp: new Date().toISOString(),
    };
    this.logger.log(
      `[SEND-START] requestId=${requestId} kafka.send -> user, payload=${JSON.stringify(payload)}`,
    );
    try {
      // Per-attempt timeout: 10s, with 2 retries = 30s total max
      const response = await this.rmqProducer.send<
        { statusCode: number; message: string; data: Record<string, unknown> },
        typeof payload
      >('kafka.send', payload, 10000, 2);
      const duration = Date.now() - startTime;
      this.logger.log(
        `[SEND-SUCCESS] requestId=${requestId} kafka.send <- user, duration=${duration}ms, response=${JSON.stringify(response)}`,
      );
      // `response` already carries the RPC responder's own `{statusCode, message, data}`
      // envelope, and the global `ResponseInterceptor` adds another one on top of whatever
      // this returns — so only the actual payload goes back, not a 3rd nested wrapper.
      return {
        ...response.data,
        requestId,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.error(
        `[SEND-FAILED] requestId=${requestId} kafka.send -> user, duration=${duration}ms, error=${errorMessage}, stack=${
          error instanceof Error ? error.stack : ''
        }`,
      );

      // If it's already an HttpException (from RmqProducer), re-throw it
      if (error instanceof Error && error['status'] !== undefined) {
        throw error;
      }

      // Otherwise throw a proper HttpException with detailed error info
      throw new Error(
        `RabbitMQ send failed after ${duration}ms: ${errorMessage}. requestId=${requestId}`,
      );
    }
  }

  @Public()
  @Get('kafka/error')
  @ApiOperation({
    summary: 'RabbitMQ emit health check',
    description: 'Fire-and-forget ping to the user service over RabbitMQ — no reply is awaited',
  })
  @SwaggerResponse({
    status: 200,
    description: 'Ping emitted',
    schema: { type: 'string', example: 'Hello World!' },
  })
  async testMsgError(): Promise<unknown> {
    this.logger.log(`[EMIT] kafka.emit -> user, payload=123`);
    return await this.rmqProducer.send<unknown, number>('kafka.user.error', 123);
  }

  @Public()
  @Get('kafka/tutor/error')
  @ApiOperation({
    summary: 'RabbitMQ emit health check',
    description: 'Fire-and-forget ping to the user service over RabbitMQ — no reply is awaited',
  })
  @SwaggerResponse({
    status: 200,
    description: 'Ping emitted',
    schema: { type: 'string', example: 'Hello World!' },
  })
  async testError(): Promise<unknown> {
    this.logger.log(`[SEND] kafka.emit -> user, payload=123`);
    return await this.rmqProducer.send<unknown, number>('kafka.user', 123);
  }

  @Public()
  @Get('health/postgres')
  @ApiOperation({
    summary: 'Check PostgreSQL connection',
    description: 'Test PostgreSQL database connection via user service',
  })
  @SwaggerResponse({
    status: 200,
    description: 'PostgreSQL connection is healthy',
    schema: {
      type: 'object',
      example: {
        statusCode: 200,
        message: 'Success',
        data: {
          connection: 'postgres',
          status: 'connected',
          timestamp: '2026-09-26T08:35:31.437Z',
          databaseStats: {},
        },
        timestamp: '2026-09-26T08:35:31.437Z',
        method: 'GET',
        path: '/health/postgres',
        correlationId: '...',
      },
    },
  })
  async checkPostgresConnection(): Promise<unknown> {
    this.logger.log('[HEALTH] Checking PostgreSQL connection and fetching user data');
    try {
      const response = await this.rmqProducer.send<unknown, unknown>('health.postgres', {
        fetchData: true,
      });
      this.logger.log(`[HEALTH] PostgreSQL data fetched: ${JSON.stringify(response)}`);
      // The global `ResponseInterceptor` already wraps whatever this returns in its own
      // `{statusCode, message, data, ...}` envelope — don't nest a second one.
      return {
        connection: 'postgres',
        status: 'connected',
        timestamp: new Date().toISOString(),
        databaseStats: response,
      };
    } catch (error) {
      this.logger.error(`[HEALTH] PostgreSQL connection failed: ${error}`);
      throw error;
    }
  }

  @Public()
  @Get('health/redis')
  @ApiOperation({
    summary: 'Check Redis connection',
    description: 'Test Redis cache connection via third service',
  })
  @SwaggerResponse({
    status: 200,
    description: 'Redis connection is healthy',
    schema: {
      type: 'object',
      example: {
        statusCode: 200,
        message: 'Success',
        data: {
          connection: 'redis',
          status: 'connected',
          timestamp: '2026-09-26T08:35:31.437Z',
          cacheStats: {},
        },
        timestamp: '2026-09-26T08:35:31.437Z',
        method: 'GET',
        path: '/health/redis',
        correlationId: '...',
      },
    },
  })
  async checkRedisConnection(): Promise<unknown> {
    this.logger.log('[HEALTH] Checking Redis connection and fetching cache data');
    try {
      const response = await this.rmqProducer.send<unknown, unknown>('health.redis', {
        fetchData: true,
      });
      this.logger.log(`[HEALTH] Redis data fetched: ${JSON.stringify(response)}`);
      // The global `ResponseInterceptor` already wraps whatever this returns in its own
      // `{statusCode, message, data, ...}` envelope — don't nest a second one.
      return {
        connection: 'redis',
        status: 'connected',
        timestamp: new Date().toISOString(),
        cacheStats: response,
      };
    } catch (error) {
      this.logger.error(`[HEALTH] Redis connection failed: ${error}`);
      throw error;
    }
  }
}
