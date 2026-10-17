import { Controller, Get, HttpCode, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerResponse,
} from '@nestjs/swagger';
import { StatusCodes } from 'http-status-codes';
import { Roles } from '@packages/decorators';
import { RolesGuard } from '@packages/guards';
import { RmqProducer } from '../rabbitmq/rmq.producer';

/**
 * Gateway is a thin HTTP edge for `emails`: the handler forwards to the owning service over
 * RabbitMQ via `RmqProducer.send()`. No mail logic lives here.
 */
@ApiTags('Email')
@Controller('emails')
export class EmailController {
  constructor(private readonly rmqProducer: RmqProducer) {}

  @ApiBearerAuth('access-token')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Get()
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    summary: 'Test email',
    description: 'Send a test email through the third-service',
  })
  @SwaggerResponse({ status: 200, description: 'Test email sent' })
  testSendEmail() {
    return this.rmqProducer.send('email.test', {}, 30000, 0);
  }
}
