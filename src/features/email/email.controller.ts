import { Controller, Get, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse as SwaggerResponse } from '@nestjs/swagger';
import { StatusCodes } from 'http-status-codes';
import { Public } from '@packages/decorators';
import { RmqProducer } from '../rabbitmq/rmq.producer';

/**
 * Gateway is a thin HTTP edge for `emails`: the handler forwards to the owning service over
 * RabbitMQ via `RmqProducer.send()`. No mail logic lives here.
 */
@ApiTags('Email')
@Controller('emails')
export class EmailController {
  constructor(private readonly rmqProducer: RmqProducer) {}

  @Public()
  @Get()
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Test email', description: 'Send a test email through the third-service' })
  @SwaggerResponse({ status: 200, description: 'Test email sent' })
  testSendEmail() {
    return this.rmqProducer.send('email.test', {});
  }
}