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
import { CurrentUser } from '@packages/decorators';
import {
  changePasswordSchema,
  getUsersQuerySchema,
  type ChangePasswordValues,
  type CreateUserDto,
  type CreateUserResponseDto,
  createUserSchema,
  dataFieldSchema,
  type GetUsersQueryDto,
  type UpdateUserDto,
  updateUserSchema,
  type UserDataFieldDto,
} from '@packages/entities/user';
import type { JwtGuardUser } from '@packages/guards/jwt-auth.guard';
import { USER_SWAGGER_MESSAGES } from 'src/data/swaggers/messages';
import { USER_SWAGGERS_DATA } from 'src/data/swaggers/data/user.swagger';
import { RmqProducer } from '../rabbitmq/rmq.producer';

/**
 * Gateway is a thin HTTP edge here: validation/guards/Swagger stay, every handler forwards to
 * the `user` service over RabbitMQ via `RmqProducer.send()` — no local business logic or DB access.
 */
@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UserController {
  constructor(private readonly rmqProducer: RmqProducer) {}

  @Get()
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    summary: USER_SWAGGER_MESSAGES.GET_USERS_SUCCESSFULLY,
    description: USER_SWAGGER_MESSAGES.GET_USERS_SUCCESSFULLY,
  })
  @ApiQuery(USER_SWAGGERS_DATA.GET_USERS_QUERY[0])
  @ApiQuery(USER_SWAGGERS_DATA.GET_USERS_QUERY[1])
  @ApiQuery(USER_SWAGGERS_DATA.GET_USERS_QUERY[2])
  @ApiQuery(USER_SWAGGERS_DATA.GET_USERS_QUERY[3])
  @ApiQuery(USER_SWAGGERS_DATA.GET_USERS_QUERY[4])
  @ApiQuery(USER_SWAGGERS_DATA.GET_USERS_QUERY[5])
  @SwaggerResponse({
    status: StatusCodes.OK,
    description: USER_SWAGGER_MESSAGES.GET_USERS_SUCCESSFULLY,
  })
  getUsers(
    @Query(new ZodValidationPipe<GetUsersQueryDto>(getUsersQuerySchema))
    _query: GetUsersQueryDto,
  ) {
    return this.rmqProducer.send('user.getUsers', _query);
  }

  @Get('/detail-user')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    summary: USER_SWAGGER_MESSAGES.GET_USER_SUCCESSFULLY,
    description: USER_SWAGGER_MESSAGES.GET_USER_SUCCESSFULLY,
  })
  @SwaggerResponse({
    status: StatusCodes.OK,
    description: USER_SWAGGER_MESSAGES.GET_USER_SUCCESSFULLY,
  })
  getDetailUserController(@CurrentUser() _user: Record<string, string>) {
    return this.rmqProducer.send('user.getDetailUser', { userId: _user.id });
  }

  @Get('/get-by-field')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    summary: USER_SWAGGER_MESSAGES.GET_USER_BY_FIELD_SUCCESSFULLY,
    description: USER_SWAGGER_MESSAGES.GET_USER_BY_FIELD_SUCCESSFULLY,
  })
  @ApiQuery(USER_SWAGGERS_DATA.GET_USER_BY_FIELD_QUERY[0])
  @ApiQuery(USER_SWAGGERS_DATA.GET_USER_BY_FIELD_QUERY[1])
  @SwaggerResponse({
    status: StatusCodes.OK,
    description: USER_SWAGGER_MESSAGES.GET_USER_BY_FIELD_SUCCESSFULLY,
  })
  getUserByField(
    @Query(new ZodValidationPipe(dataFieldSchema))
    _dataFieldDto: UserDataFieldDto,
  ): Promise<unknown> {
    return this.rmqProducer.send('user.getUserByField', _dataFieldDto);
  }

  @Post()
  @HttpCode(StatusCodes.CREATED)
  @ApiOperation({
    summary: USER_SWAGGER_MESSAGES.CREATE_USER_SUCCESSFULLY,
    description: USER_SWAGGER_MESSAGES.CREATE_USER_SUCCESSFULLY,
  })
  @ApiBody({ schema: USER_SWAGGERS_DATA.CREATE_USER_SCHEMA })
  @SwaggerResponse({
    status: StatusCodes.CREATED,
    description: USER_SWAGGER_MESSAGES.CREATE_USER_SUCCESSFULLY,
  })
  createUser(
    @Body(new ZodValidationPipe(createUserSchema))
    _createUserDto: CreateUserDto,
  ): Promise<CreateUserResponseDto> {
    return this.rmqProducer.send('user.createUser', _createUserDto);
  }

  @Put('')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    summary: USER_SWAGGER_MESSAGES.UPDATE_USER_SUCCESSFULLY,
    description: USER_SWAGGER_MESSAGES.UPDATE_USER_SUCCESSFULLY,
  })
  @ApiBody({ schema: USER_SWAGGERS_DATA.UPDATE_USER_SCHEMA })
  @SwaggerResponse({
    status: StatusCodes.OK,
    description: USER_SWAGGER_MESSAGES.UPDATE_USER_SUCCESSFULLY,
  })
  updateUserController(
    @CurrentUser() _user: JwtGuardUser,
    @Body(new ZodValidationPipe<UpdateUserDto>(updateUserSchema))
    _updateUserDto: UpdateUserDto,
  ) {
    return this.rmqProducer.send('user.updateUser', { userId: _user.id, role: _user.role, ..._updateUserDto });
  }

  @Put('/:id')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    summary: USER_SWAGGER_MESSAGES.UPDATE_USER_SUCCESSFULLY,
    description: USER_SWAGGER_MESSAGES.UPDATE_USER_SUCCESSFULLY,
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', description: 'User ID' })
  @ApiBody({ schema: USER_SWAGGERS_DATA.UPDATE_USER_SCHEMA })
  @SwaggerResponse({
    status: StatusCodes.OK,
    description: USER_SWAGGER_MESSAGES.UPDATE_USER_SUCCESSFULLY,
  })
  updateUserByAdminController(
    @Param('id') _id: string,
    @Body(new ZodValidationPipe<UpdateUserDto>(updateUserSchema))
    _updateUserDto: UpdateUserDto,
  ) {
    return this.rmqProducer.send('user.updateUserByAdmin', { id: _id, ..._updateUserDto });
  }

  @Put('/:id/status')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    summary: USER_SWAGGER_MESSAGES.UPDATE_USER_STATUS_SUCCESSFULLY,
    description: USER_SWAGGER_MESSAGES.UPDATE_USER_STATUS_SUCCESSFULLY,
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', description: 'User ID' })
  @SwaggerResponse({
    status: StatusCodes.OK,
    description: USER_SWAGGER_MESSAGES.UPDATE_USER_STATUS_SUCCESSFULLY,
  })
  updateStatusUserController(@Param('id') _id: string) {
    return this.rmqProducer.send('user.updateStatusUser', { id: _id });
  }

  @Delete('/:id')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    summary: USER_SWAGGER_MESSAGES.DELETE_USER_SUCCESSFULLY,
    description: USER_SWAGGER_MESSAGES.DELETE_USER_SUCCESSFULLY,
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', description: 'User ID' })
  @SwaggerResponse({
    status: StatusCodes.OK,
    description: USER_SWAGGER_MESSAGES.DELETE_USER_SUCCESSFULLY,
  })
  deleteUserByAdminController(@Param('id') _id: string) {
    return this.rmqProducer.send('user.deleteUserByAdmin', { id: _id });
  }

  @Post('change-password')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    summary: USER_SWAGGER_MESSAGES.CHANGE_PASSWORD_SUCCESSFULLY,
    description: USER_SWAGGER_MESSAGES.CHANGE_PASSWORD_SUCCESSFULLY,
  })
  @ApiBody({ schema: USER_SWAGGERS_DATA.CHANGE_PASSWORD_SCHEMA })
  @SwaggerResponse({
    status: StatusCodes.OK,
    description: USER_SWAGGER_MESSAGES.CHANGE_PASSWORD_SUCCESSFULLY,
  })
  changePasswordController(
    @CurrentUser() _user: Record<string, string>,
    @Body(new ZodValidationPipe(changePasswordSchema))
    _changePasswordDto: ChangePasswordValues,
  ) {
    return this.rmqProducer.send('user.changePassword', { userId: _user.id, ..._changePasswordDto });
  }
}
