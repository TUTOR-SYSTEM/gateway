import { Body, Controller, Get, HttpCode, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse as SwaggerResponse, ApiTags } from '@nestjs/swagger';
import { StatusCodes } from 'http-status-codes';
import { ZodValidationPipe } from '@packages/pipes';
import { CurrentUser, Roles } from '@packages/decorators';
import { RolesGuard } from '@packages/guards';
import type { JwtGuardUser } from '@packages/guards/jwt-auth.guard';
import { RmqProducer } from '../rabbitmq/rmq.producer';
import {
  updatePaymentSettingsSchema,
  updateTeachingSettingsSchema,
  type UpdatePaymentSettingsDto,
  type UpdateTeachingSettingsDto,
} from './tutor-settings.schema';

/** Cài đặt giảng dạy của gia sư — forward sang tutor-service qua RabbitMQ. */
@ApiTags('Settings')
@ApiBearerAuth('access-token')
@Controller('settings')
export class TutorSettingsController {
  constructor(private readonly rmqProducer: RmqProducer) {}

  @Get('teaching')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TUTOR')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Get teaching settings of the current tutor' })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Teaching settings fetched' })
  get(@CurrentUser() user: JwtGuardUser) {
    return this.rmqProducer.send('settings.teachingGet', { userId: user.id });
  }

  @Put('teaching')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TUTOR')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Update teaching settings of the current tutor' })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Teaching settings updated' })
  update(
    @Body(new ZodValidationPipe<UpdateTeachingSettingsDto>(updateTeachingSettingsSchema))
    dto: UpdateTeachingSettingsDto,
    @CurrentUser() user: JwtGuardUser,
  ) {
    return this.rmqProducer.send('settings.teachingUpdate', { userId: user.id, data: dto });
  }

  @Get('payment')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TUTOR')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Get payment (receiving account) settings of the current tutor' })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Payment settings fetched' })
  getPayment(@CurrentUser() user: JwtGuardUser) {
    return this.rmqProducer.send('settings.paymentGet', { userId: user.id });
  }

  @Put('payment')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TUTOR')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Update payment (receiving account) settings of the current tutor' })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Payment settings updated' })
  updatePayment(
    @Body(new ZodValidationPipe<UpdatePaymentSettingsDto>(updatePaymentSettingsSchema))
    dto: UpdatePaymentSettingsDto,
    @CurrentUser() user: JwtGuardUser,
  ) {
    return this.rmqProducer.send('settings.paymentUpdate', { userId: user.id, data: dto });
  }
}
