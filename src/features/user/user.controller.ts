import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  ParseUUIDPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
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
  updateSelfSchema,
  type UpdateSelfDto,
  updateUserStatusSchema,
  type UpdateUserStatusDto,
  type UserDataFieldDto,
} from '@packages/entities/user';
import type { JwtGuardUser } from '@packages/guards/jwt-auth.guard';
import { RolesGuard } from '@packages/guards';
import { ERROR_MESSAGES } from 'src/data/constants';
import { USER_SWAGGER_MESSAGES } from 'src/data/swaggers/messages';
import { USER_SWAGGERS_DATA } from 'src/data/swaggers/data/user.swagger';
import { RmqProducer } from '../rabbitmq/rmq.producer';
import { setRefreshCookie } from '@packages/helpers/refresh-cookie.helper';

/**
 * Gateway is a thin HTTP edge here: validation/guards/Swagger stay, every handler forwards to
 * the `user` service over RabbitMQ via `RmqProducer.send()` — no local business logic or DB access.
 */
@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UserController {
  constructor(
    private readonly rmqProducer: RmqProducer,
    private readonly configService: ConfigService,
  ) {}

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
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
    @CurrentUser() user: JwtGuardUser,
    @Query(new ZodValidationPipe<GetUsersQueryDto>(getUsersQuerySchema))
    query: GetUsersQueryDto,
  ) {
    return this.rmqProducer.send('user.getUsers', {
      ...query,
      actorId: user.id,
      actorRole: user.role,
    });
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
  getDetailUserController(@CurrentUser() user: JwtGuardUser) {
    return this.rmqProducer.send('user.getDetailUser', {
      userId: user.id,
      actorId: user.id,
      actorRole: user.role,
    });
  }

  @Get('/get-by-field')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
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
    @CurrentUser() user: JwtGuardUser,
    @Query(new ZodValidationPipe(dataFieldSchema))
    dataFieldDto: UserDataFieldDto,
  ): Promise<unknown> {
    return this.rmqProducer.send('user.getUserByField', {
      ...dataFieldDto,
      actorId: user.id,
      actorRole: user.role,
    });
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
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
    @CurrentUser() user: JwtGuardUser,
    @Body(new ZodValidationPipe(createUserSchema))
    createUserDto: CreateUserDto,
  ): Promise<CreateUserResponseDto> {
    return this.rmqProducer.send(
      'user.createUser',
      {
        ...createUserDto,
        actorId: user.id,
        actorRole: user.role,
      },
      30000,
      0,
    );
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
    @CurrentUser() user: JwtGuardUser,
    @Body(new ZodValidationPipe<UpdateSelfDto>(updateSelfSchema))
    updateUserDto: UpdateSelfDto,
  ) {
    // A STUDENT may not change their own email (other roles may).
    if (user.role === 'STUDENT' && updateUserDto.email !== undefined) {
      throw new BadRequestException(ERROR_MESSAGES.STUDENT_CANNOT_UPDATE_EMAIL);
    }
    return this.rmqProducer.send('user.updateUser', {
      ...updateUserDto,
      userId: user.id,
      // Trusted identity overrides any body field; the user service ignores `role` and reads actor.
      role: user.role,
      actorId: user.id,
      actorRole: user.role,
    });
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
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
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtGuardUser,
    @Body(new ZodValidationPipe<UpdateUserDto>(updateUserSchema))
    updateUserDto: UpdateUserDto,
  ) {
    return this.rmqProducer.send('user.updateUserByAdmin', {
      ...updateUserDto,
      id: id,
      actorId: user.id,
      actorRole: user.role,
    });
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
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
  updateStatusUserController(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtGuardUser,
    @Body(new ZodValidationPipe<UpdateUserStatusDto>(updateUserStatusSchema))
    body: UpdateUserStatusDto,
  ) {
    return this.rmqProducer.send('user.updateStatusUser', {
      id: id,
      isActive: body.isActive,
      actorId: user.id,
      actorRole: user.role,
    });
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
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
  deleteUserByAdminController(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtGuardUser,
  ) {
    return this.rmqProducer.send('user.deleteUserByAdmin', {
      id: id,
      actorId: user.id,
      actorRole: user.role,
    });
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
  @SwaggerResponse({
    status: StatusCodes.BAD_REQUEST,
    description: 'Current password is incorrect (400, not 401: the session stays valid)',
  })
  async changePasswordController(
    @CurrentUser() user: Record<string, string>,
    @Body(new ZodValidationPipe(changePasswordSchema))
    changePasswordDto: ChangePasswordValues,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    // Other devices are signed out; this device keeps its session and gets a fresh refresh token,
    // which goes into the httpOnly cookie (never into the JSON body).
    const { refreshToken, message } = await this.rmqProducer.send<
      { message: string; refreshToken: string },
      ChangePasswordValues & {
        userId: string;
        actorId: string;
        actorRole: string;
        actorSid: string;
      }
    >('user.changePassword', {
      ...changePasswordDto,
      userId: user.id,
      actorId: user.id,
      actorRole: user.role,
      actorSid: user.sid,
    });
    setRefreshCookie(res, refreshToken, this.configService);
    return { message };
  }
}
