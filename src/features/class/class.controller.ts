import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
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
import { CurrentUser } from '@packages/decorators';
import {
  createClassSchema,
  getClassesQuerySchema,
  type AddStudentsDto,
  addStudentsSchema,
  type CreateClassDto,
  type GetClassesQueryDto,
  type UpdateClassDto,
  updateClassSchema,
} from '@packages/entities/class';
import type { JwtGuardUser } from '@packages/guards/jwt-auth.guard';
import { RmqProducer } from '../rabbitmq/rmq.producer';

/**
 * Gateway is a thin HTTP edge for the education `class` domain: validation/guards/Swagger stay,
 * every handler forwards to the `tutor-service` over RabbitMQ via `RmqProducer.send()`.
 */
@ApiTags('Classes')
@ApiBearerAuth('access-token')
@Controller('classes')
export class ClassController {
  constructor(private readonly rmqProducer: RmqProducer) {}

  @Post()
  @HttpCode(StatusCodes.CREATED)
  @ApiOperation({ summary: 'Create class', description: 'Create a new class (Stage 1: class info)' })
  @ApiBody({ schema: { type: 'object', required: ['name', 'subject', 'tutorId'] } })
  @SwaggerResponse({ status: 201, description: 'Class created' })
  create(
    @Body(new ZodValidationPipe<CreateClassDto>(createClassSchema))
    dto: CreateClassDto,
    @CurrentUser() user: JwtGuardUser,
  ) {
    return this.rmqProducer.send('class.create', { userId: user.id, ...dto });
  }

  @Put(':id')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    summary: 'Update class',
    description: "Update a class's info and/or reconcile its enrolled students",
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @SwaggerResponse({ status: 200, description: 'Class updated' })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe<UpdateClassDto>(updateClassSchema))
    dto: UpdateClassDto,
    @CurrentUser() user: JwtGuardUser,
  ) {
    return this.rmqProducer.send('class.update', { userId: user.id, id, ...dto });
  }

  @Get('generate-code')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Generate class code', description: 'Generate a unique, unused class code' })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Class code generated' })
  generateCode() {
    return this.rmqProducer.send('class.generateCode', {});
  }

  @Get()
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Get classes', description: 'Get and filter classes' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['OPEN', 'CLOSED', 'UPCOMING'] })
  @ApiQuery({ name: 'subject', required: false, type: String })
  @ApiQuery({ name: 'studentsId', required: false, type: String, format: 'uuid' })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Class list fetched' })
  getAll(
    @Query(new ZodValidationPipe<GetClassesQueryDto>(getClassesQuerySchema))
    query: GetClassesQueryDto,
    @CurrentUser() user: JwtGuardUser,
  ) {
    return this.rmqProducer.send('class.getAll', { userId: user.id, ...query });
  }

  @Get(':id')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Get class detail' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Class detail fetched' })
  getById(@Param('id') id: string, @CurrentUser() user: JwtGuardUser) {
    return this.rmqProducer.send('class.getById', { userId: user.id, id });
  }

  @Post(':id/students')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Add students', description: 'Enroll one student or many students into a single class' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Students added' })
  addStudents(
    @Param('id') id: string,
    @Body(new ZodValidationPipe<AddStudentsDto>(addStudentsSchema))
    dto: AddStudentsDto,
    @CurrentUser() user: JwtGuardUser,
  ) {
    return this.rmqProducer.send('class.addStudents', { userId: user.id, classId: id, ...dto });
  }

  @Get(':id/students')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Get students in class' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Students fetched' })
  getStudents(@Param('id') id: string, @CurrentUser() user: JwtGuardUser) {
    return this.rmqProducer.send('class.getStudents', { userId: user.id, classId: id });
  }

  @Get(':id/materials')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Get class materials', description: 'List theory & exercise files of a class' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Class materials retrieved' })
  getMaterials(@Param('id') id: string, @CurrentUser() user: JwtGuardUser) {
    return this.rmqProducer.send('class.getMaterials', { userId: user.id, classId: id });
  }

  @Get(':id/watches')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    summary: 'Get class watch overview',
    description: 'Aggregated class overview for the STUDENT/PARENT read-only page',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Class watch overview retrieved' })
  getWatch(@Param('id') id: string, @CurrentUser() user: JwtGuardUser) {
    return this.rmqProducer.send('class.getWatch', { userId: user.id, classId: id });
  }

  @Delete(':id')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Delete class' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Class deleted' })
  del(@Param('id') id: string, @CurrentUser() user: JwtGuardUser) {
    return this.rmqProducer.send('class.delete', { userId: user.id, id });
  }
}