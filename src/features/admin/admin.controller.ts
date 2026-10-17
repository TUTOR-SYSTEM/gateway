import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  ParseUUIDPipe,
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
import { CurrentUser, Roles } from '@packages/decorators';
import { RolesGuard } from '@packages/guards';
import type { JwtGuardUser } from '@packages/guards/jwt-auth.guard';
import { ZodValidationPipe } from '@packages/pipes';
import {
  createManagedUserSchema,
  updateManagedUserSchema,
  updateManagedStudentSchema,
  listManagedUsersQuerySchema,
  type CreateManagedUserDto,
  type UpdateManagedUserDto,
  type UpdateManagedStudentDto,
  type ListManagedUsersQueryDto,
} from '@packages/entities/admin';
import { RmqProducer } from '../rabbitmq/rmq.producer';

const CREATE_ACCOUNT_BODY_SCHEMA = {
  type: 'object',
  required: ['email', 'firstName', 'lastName', 'password'],
  properties: {
    email: { type: 'string', format: 'email', example: 'user@example.com' },
    username: { type: 'string', maxLength: 50, example: 'nguyenvana' },
    firstName: { type: 'string', minLength: 2, maxLength: 100, example: 'Nguyen' },
    lastName: { type: 'string', minLength: 2, maxLength: 100, example: 'Van A' },
    password: { type: 'string', minLength: 8, maxLength: 14, example: 'Pass1234!' },
    phone: { type: 'string', maxLength: 20, example: '0987654321' },
    gender: { type: 'string', enum: ['MALE', 'FEMALE', 'OTHER'], example: 'MALE' },
    dateOfBirth: { type: 'string', format: 'date-time', example: '2000-01-15T00:00:00.000Z' },
    school: { type: 'string', maxLength: 255, example: 'THPT Le Hong Phong' },
    subjects: {
      type: 'array',
      items: { type: 'string' },
      example: ['Toán', 'Vật lý'],
      description: 'Danh sách môn dạy (chọn nhiều)',
    },
    description: { type: 'string', maxLength: 5000, example: 'Short bio' },
    isActive: { type: 'boolean', example: true },
  },
};

const UPDATE_ACCOUNT_BODY_SCHEMA = {
  type: 'object',
  properties: {
    email: { type: 'string', format: 'email', example: 'updated@example.com' },
    username: { type: 'string', maxLength: 50, example: 'newusername' },
    firstName: { type: 'string', minLength: 2, maxLength: 100, example: 'Nguyen' },
    lastName: { type: 'string', minLength: 2, maxLength: 100, example: 'Van A' },
    phone: { type: 'string', maxLength: 20, nullable: true, example: '0987654321' },
    gender: { type: 'string', enum: ['MALE', 'FEMALE', 'OTHER'], nullable: true, example: 'MALE' },
    dateOfBirth: { type: 'string', format: 'date-time', nullable: true },
    school: { type: 'string', maxLength: 255, nullable: true, example: 'THPT Le Hong Phong' },
    subjects: {
      type: 'array',
      items: { type: 'string' },
      nullable: true,
      example: ['Toán', 'Vật lý'],
      description: 'Danh sách môn dạy (chọn nhiều); mảng rỗng/null để xoá',
    },
    description: { type: 'string', maxLength: 5000, nullable: true, example: 'Short bio' },
    avatar: { type: 'string', format: 'uri', nullable: true },
    isActive: { type: 'boolean', example: true },
  },
};

const UPDATE_STUDENT_BODY_SCHEMA = {
  type: 'object',
  properties: {
    ...UPDATE_ACCOUNT_BODY_SCHEMA.properties,
    userCode: { type: 'string', maxLength: 6, example: 'STU001' },
    address: { type: 'string', nullable: true, example: '123 Le Loi' },
    district: { type: 'string', maxLength: 30, nullable: true, example: 'Quan 1' },
    province: { type: 'string', maxLength: 30, nullable: true, example: 'TP HCM' },
    parentId: { type: 'string', format: 'uuid', nullable: true },
    tutorId: { type: 'string', format: 'uuid', nullable: true },
  },
};

/**
 * Admin-only management of tutor and student accounts.
 *
 * Every route is protected by the global `JwtAuthGuard` (authentication) plus a
 * controller-level `RolesGuard` + `@Roles('ADMIN')` (authorization) — only users
 * whose JWT carries `role: ADMIN` may reach any handler here. Gateway forwards every
 * request to the `user` service over RabbitMQ; no local business logic or DB access.
 */
@ApiTags('Admin')
@ApiBearerAuth('access-token')
@UseGuards(RolesGuard)
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly rmqProducer: RmqProducer) {}

  // ─── Tutors ────────────────────────────────────────────────────────
  @Post('tutors')
  @HttpCode(StatusCodes.CREATED)
  @ApiOperation({ summary: 'Create tutor', description: 'Create a new TUTOR account (admin only)' })
  @ApiBody({ schema: CREATE_ACCOUNT_BODY_SCHEMA })
  @SwaggerResponse({ status: 201, description: 'Tutor created' })
  createTutor(
    @Body(new ZodValidationPipe(createManagedUserSchema)) _dto: CreateManagedUserDto,
    @CurrentUser() _currentUser: JwtGuardUser,
  ) {
    // role gắn server-side SAU validate: client không quyết định role; USER mặc định STUDENT nếu thiếu.
    return this.rmqProducer.send(
      'admin.createTutor',
      { ..._dto, actorId: _currentUser.id, actorRole: _currentUser.role },
      30000,
      0,
    );
  }

  @Get('tutors')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'List tutors', description: 'Paginated list of tutors (admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search name/email/phone',
  })
  @ApiQuery({ name: 'isActive', required: false, enum: ['true', 'false'] })
  @SwaggerResponse({ status: 200, description: 'Tutors fetched' })
  listTutors(
    @Query(new ZodValidationPipe<ListManagedUsersQueryDto>(listManagedUsersQuerySchema))
    query: ListManagedUsersQueryDto,
    @CurrentUser() _currentUser: JwtGuardUser,
  ) {
    // role đặt SAU spread: client không thể ghi đè role (USER chỉ lọc khi có role trong payload).
    return this.rmqProducer.send('admin.listTutors', {
      ...query,
      actorId: _currentUser.id,
      actorRole: _currentUser.role,
    });
  }

  @Get('tutors/:id')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Get tutor detail' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @SwaggerResponse({ status: 200, description: 'Tutor detail' })
  @SwaggerResponse({ status: 404, description: 'Tutor not found' })
  getTutor(@Param('id', ParseUUIDPipe) _id: string, @CurrentUser() _currentUser: JwtGuardUser) {
    return this.rmqProducer.send('admin.getTutor', {
      id: _id,
      actorId: _currentUser.id,
      actorRole: _currentUser.role,
    });
  }

  @Put('tutors/:id')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Update tutor' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ schema: UPDATE_ACCOUNT_BODY_SCHEMA })
  @SwaggerResponse({ status: 200, description: 'Tutor updated' })
  updateTutor(
    @Param('id', ParseUUIDPipe) _id: string,
    @CurrentUser() _currentUser: JwtGuardUser,
    @Body(new ZodValidationPipe(updateManagedUserSchema)) _dto: UpdateManagedUserDto,
  ) {
    return this.rmqProducer.send('admin.updateTutor', {
      ..._dto,
      id: _id,
      actorId: _currentUser.id,
      actorRole: _currentUser.role,
    });
  }

  @Delete('tutors/:id')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Delete tutor' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @SwaggerResponse({ status: 200, description: 'Tutor deleted' })
  deleteTutor(@Param('id', ParseUUIDPipe) _id: string, @CurrentUser() _currentUser: JwtGuardUser) {
    return this.rmqProducer.send('admin.deleteTutor', {
      id: _id,
      actorId: _currentUser.id,
      actorRole: _currentUser.role,
    });
  }

  // ─── Students ──────────────────────────────────────────────────────
  @Post('students')
  @HttpCode(StatusCodes.CREATED)
  @ApiOperation({
    summary: 'Create student',
    description: 'Create a new STUDENT account (admin only)',
  })
  @ApiBody({ schema: CREATE_ACCOUNT_BODY_SCHEMA })
  @SwaggerResponse({ status: 201, description: 'Student created' })
  createStudent(
    @Body(new ZodValidationPipe(createManagedUserSchema)) _dto: CreateManagedUserDto,
    @CurrentUser() _currentUser: JwtGuardUser,
  ) {
    return this.rmqProducer.send(
      'admin.createStudent',
      { ..._dto, actorId: _currentUser.id, actorRole: _currentUser.role },
      30000,
      0,
    );
  }

  @Get('students')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    summary: 'List students',
    description: 'Paginated list of students (admin only)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search name/email/phone',
  })
  @ApiQuery({ name: 'isActive', required: false, enum: ['true', 'false'] })
  @SwaggerResponse({ status: 200, description: 'Students fetched' })
  listStudents(
    @Query(new ZodValidationPipe<ListManagedUsersQueryDto>(listManagedUsersQuerySchema))
    query: ListManagedUsersQueryDto,
    @CurrentUser() _currentUser: JwtGuardUser,
  ) {
    // role đặt SAU spread: client không thể ghi đè role (USER chỉ lọc khi có role trong payload).
    return this.rmqProducer.send('admin.listStudents', {
      ...query,
      actorId: _currentUser.id,
      actorRole: _currentUser.role,
    });
  }

  @Get('students/:id')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Get student detail' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @SwaggerResponse({ status: 200, description: 'Student detail' })
  @SwaggerResponse({ status: 404, description: 'Student not found' })
  getStudent(@Param('id', ParseUUIDPipe) _id: string, @CurrentUser() _currentUser: JwtGuardUser) {
    return this.rmqProducer.send('admin.getStudent', {
      id: _id,
      actorId: _currentUser.id,
      actorRole: _currentUser.role,
    });
  }

  @Put('students/:id')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    summary: 'Update student',
    description: 'Admin update of a student — every profile field is editable.',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ schema: UPDATE_STUDENT_BODY_SCHEMA })
  @SwaggerResponse({ status: 200, description: 'Student updated' })
  updateStudent(
    @Param('id', ParseUUIDPipe) _id: string,
    @CurrentUser() _currentUser: JwtGuardUser,
    @Body(new ZodValidationPipe(updateManagedStudentSchema)) _dto: UpdateManagedStudentDto,
  ) {
    return this.rmqProducer.send('admin.updateStudent', {
      ..._dto,
      id: _id,
      actorId: _currentUser.id,
      actorRole: _currentUser.role,
    });
  }

  @Delete('students/:id')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Delete student' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @SwaggerResponse({ status: 200, description: 'Student deleted' })
  deleteStudent(
    @Param('id', ParseUUIDPipe) _id: string,
    @CurrentUser() _currentUser: JwtGuardUser,
  ) {
    return this.rmqProducer.send('admin.deleteStudent', {
      id: _id,
      actorId: _currentUser.id,
      actorRole: _currentUser.role,
    });
  }
}
