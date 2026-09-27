import { Body, Controller, Get, HttpCode, Param, Put } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse as SwaggerResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { StatusCodes } from 'http-status-codes';
import { ZodValidationPipe } from '@packages/pipes';
import { CurrentUser } from '@packages/decorators';
import {
  upsertAttendanceSchema,
  type UpsertAttendanceDto,
} from '@packages/entities/attendance';
import type { JwtGuardUser } from '@packages/guards/jwt-auth.guard';
import { RmqProducer } from '../rabbitmq/rmq.producer';

/**
 * Gateway is a thin HTTP edge for `attendance`: validation/guards/Swagger stay, every handler
 * forwards to the `tutor-service` over RabbitMQ via `RmqProducer.send()`.
 */
@ApiTags('Attendance')
@ApiBearerAuth('access-token')
@Controller('attendances')
export class AttendanceController {
  constructor(private readonly rmqProducer: RmqProducer) {}

  @Get('session/:sessionId')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    summary: 'Get attendance',
    description: 'List a session roster merged with each student attendance record',
  })
  @ApiParam({ name: 'sessionId', type: String, format: 'uuid' })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Attendance fetched' })
  getBySession(@Param('sessionId') sessionId: string, @CurrentUser() user: JwtGuardUser) {
    return this.rmqProducer.send('attendance.getBySession', { userId: user.id, sessionId });
  }

  @Put()
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    summary: 'Mark attendance',
    description: "Mark or update a single student's attendance for a session (upsert)",
  })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Attendance marked' })
  upsert(
    @Body(new ZodValidationPipe<UpsertAttendanceDto>(upsertAttendanceSchema))
    dto: UpsertAttendanceDto,
    @CurrentUser() user: JwtGuardUser,
  ) {
    return this.rmqProducer.send('attendance.upsert', { userId: user.id, ...dto });
  }
}