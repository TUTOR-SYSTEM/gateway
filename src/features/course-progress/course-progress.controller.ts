import { Body, Controller, Get, HttpCode, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse as SwaggerResponse, ApiTags } from '@nestjs/swagger';
import { StatusCodes } from 'http-status-codes';
import { ZodValidationPipe } from '@packages/pipes';
import { CurrentUser } from '@packages/decorators';
import {
  courseProgressSnapshotSchema,
  type CourseProgressSnapshot,
} from '@packages/entities/course-progress';
import type { JwtGuardUser } from '@packages/guards/jwt-auth.guard';
import { RmqProducer } from '../rabbitmq/rmq.producer';

/**
 * Gateway là cửa HTTP cho kết quả khoá học: validate rồi chuyển tiếp sang `tutor-service`
 * (sở hữu bảng course_*). User lấy từ JWT, không nhận từ body.
 */
@ApiTags('Course progress')
@ApiBearerAuth('access-token')
@Controller('course-progress')
export class CourseProgressController {
  constructor(private readonly rmqProducer: RmqProducer) {}

  @Get('results')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Get my course results', description: 'Kết quả học tập và lịch sử test của user hiện tại' })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Results fetched' })
  getResults(@CurrentUser() user: JwtGuardUser) {
    return this.rmqProducer.send('courseProgress.getResults', { userId: user.id });
  }

  @Put('sync')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Sync my course progress', description: 'Ghi tiến độ quiz/lab/debug vào DB, trả về bản tổng hợp' })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Progress synced' })
  sync(
    @Body(new ZodValidationPipe<CourseProgressSnapshot>(courseProgressSnapshotSchema))
    body: CourseProgressSnapshot,
    @CurrentUser() user: JwtGuardUser,
  ) {
    return this.rmqProducer.send('courseProgress.sync', { userId: user.id, data: body });
  }
}
