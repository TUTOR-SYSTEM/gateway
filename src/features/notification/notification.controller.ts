import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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
import { CurrentUser, Roles } from '@packages/decorators';
import { RolesGuard } from '@packages/guards';
import {
  createNotificationSchema,
  getNotificationsQuerySchema,
  type CreateNotificationDto,
  type GetNotificationsQueryDto,
} from '@packages/entities/notification';
import type { JwtGuardUser } from '@packages/guards/jwt-auth.guard';
import { RmqProducer } from '../rabbitmq/rmq.producer';

/**
 * Gateway is a thin HTTP edge for `notifications`: validation/guards/Swagger stay, every handler
 * forwards to the owning service over RabbitMQ via `RmqProducer.send()`.
 */
@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly rmqProducer: RmqProducer) {}

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TUTOR')
  @Post()
  @HttpCode(StatusCodes.CREATED)
  @ApiOperation({ summary: 'Create notification' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['type', 'title'],
      properties: {
        type: {
          type: 'string',
          enum: ['SYSTEM', 'TUITION', 'STUDENT', 'TUTOR'],
          example: 'SYSTEM',
        },
        title: { type: 'string', maxLength: 255, example: 'Cap nhat tinh nang moi' },
        content: { type: 'string', example: 'Da them chuc nang quan ly bai tap' },
        subContent: { type: 'string', example: 'Chưa cập nhật ...' },
        userId: { type: 'string', format: 'uuid', nullable: true },
        classId: { type: 'string', format: 'uuid', nullable: true },
        studentId: { type: 'string', format: 'uuid', nullable: true },
      },
    },
  })
  @SwaggerResponse({ status: 201, description: 'Notification created' })
  create(
    @Body(new ZodValidationPipe<CreateNotificationDto>(createNotificationSchema))
    dto: CreateNotificationDto,
    @CurrentUser() user: JwtGuardUser,
  ) {
    return this.rmqProducer.send('notification.create', {
      ...dto,
      senderId: user.id,
      role: user.role,
    });
  }

  @Get()
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Get all notifications for the current user' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by title' })
  @ApiQuery({ name: 'type', required: false, enum: ['SYSTEM', 'TUITION', 'STUDENT', 'TUTOR'] })
  @ApiQuery({ name: 'isRead', required: false, type: Boolean })
  @SwaggerResponse({ status: 200, description: 'Notifications fetched' })
  getAll(
    @Query(new ZodValidationPipe<GetNotificationsQueryDto>(getNotificationsQuerySchema))
    query: GetNotificationsQueryDto,
    @CurrentUser() user: JwtGuardUser,
  ) {
    return this.rmqProducer.send('notification.getAll', { userId: user.id, query });
  }

  @Patch('read-all')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    summary: 'Mark all as read',
    description: 'Mark all notifications as read for the current user',
  })
  @SwaggerResponse({ status: 200, description: 'All marked as read' })
  markAllAsRead(@CurrentUser() user: JwtGuardUser) {
    return this.rmqProducer.send('notification.markAllAsRead', { userId: user.id });
  }

  @Get(':id')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Get notification detail' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @SwaggerResponse({ status: 200, description: 'Notification detail' })
  getById(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtGuardUser) {
    return this.rmqProducer.send('notification.getById', {
      id,
      userId: user.id,
      role: user.role,
    });
  }

  @Patch(':id/read')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @SwaggerResponse({ status: 200, description: 'Marked as read' })
  markAsRead(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtGuardUser) {
    return this.rmqProducer.send('notification.markAsRead', {
      id,
      userId: user.id,
      role: user.role,
    });
  }

  @Delete(':id')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Delete notification' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @SwaggerResponse({ status: 200, description: 'Notification deleted' })
  delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtGuardUser) {
    return this.rmqProducer.send('notification.delete', {
      id,
      userId: user.id,
      role: user.role,
    });
  }
}
