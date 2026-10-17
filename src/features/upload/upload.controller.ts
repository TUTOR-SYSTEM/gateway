import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiConsumes,
  ApiQuery,
  ApiParam,
  ApiResponse as SwaggerResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { StatusCodes } from 'http-status-codes';
import { CurrentUser, Roles } from '@packages/decorators';
import type { JwtGuardUser } from '@packages/guards/jwt-auth.guard';
import { RolesGuard } from '@packages/guards';
import { Throttle } from '@nestjs/throttler';
import { ERROR_MESSAGES } from 'src/data/constants';
import { RmqProducer } from '../rabbitmq/rmq.producer';

const UPLOAD_KEY_PREFIX = 'uploads/';

/** Only keys under `uploads/` (the prefix the storage service writes) and without traversal are allowed. */
function assertValidKey(key: string): void {
  if (!key || !key.startsWith(UPLOAD_KEY_PREFIX) || key.includes('..') || key.includes('\\')) {
    throw new BadRequestException(ERROR_MESSAGES.UPLOAD_KEY_INVALID);
  }
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file
/** Upper bound on files per multipart request (also enforced by the multer interceptor). */
export const MAX_FILES_PER_REQUEST = 5;

/**
 * Gateway is a thin HTTP edge for file uploads (Cloudflare R2): the multipart body is parsed
 * here, the file payload is forwarded to the owning service over RabbitMQ via `RmqProducer.send()`,
 * and binary download streams are reconstructed from the response. No storage logic lives here.
 */
@ApiTags('Upload')
@ApiBearerAuth('access-token')
@Controller('upload')
export class UploadController {
  constructor(private readonly rmqProducer: RmqProducer) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TUTOR')
  @Throttle({ medium: { limit: 20, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  @HttpCode(StatusCodes.CREATED)
  @ApiOperation({ summary: 'Upload file', description: 'Upload a file to Cloudflare R2' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @SwaggerResponse({ status: 201, description: 'File uploaded' })
  upload(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: JwtGuardUser) {
    if (!file) throw new BadRequestException(ERROR_MESSAGES.UPLOAD_FILE_REQUIRED);
    return this.rmqProducer.send('upload.upload', {
      userId: user.id,
      role: user.role,
      file: {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        buffer: file.buffer.toString('base64'),
      },
    });
  }

  @Post('multiple')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'TUTOR')
  @Throttle({ medium: { limit: 10, ttl: 60000 } })
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES_PER_REQUEST, { limits: { fileSize: MAX_FILE_SIZE } }),
  )
  @HttpCode(StatusCodes.CREATED)
  @ApiOperation({ summary: 'Upload multiple files' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files'],
      properties: {
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
    },
  })
  @SwaggerResponse({ status: 201, description: 'Files uploaded' })
  uploadMultiple(@UploadedFiles() files: Express.Multer.File[], @CurrentUser() user: JwtGuardUser) {
    if (!files?.length) throw new BadRequestException(ERROR_MESSAGES.UPLOAD_FILES_REQUIRED);
    return this.rmqProducer.send('upload.uploadMultiple', {
      userId: user.id,
      role: user.role,
      files: files.map((file) => ({
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        buffer: file.buffer.toString('base64'),
      })),
    });
  }

  @Get('download')
  @ApiOperation({
    summary: 'Download file',
    description: 'Stream a file from Cloudflare R2 by its key',
  })
  @ApiQuery({ name: 'key', required: true, description: 'R2 object key (e.g. uploads/uuid.jpg)' })
  @SwaggerResponse({ status: 200, description: 'File stream' })
  @SwaggerResponse({ status: 400, description: 'key query param missing' })
  @SwaggerResponse({ status: 404, description: 'File not found in R2' })
  async download(
    @Query('key') key: string,
    @CurrentUser() user: JwtGuardUser,
    @Res() res: Response,
  ): Promise<void> {
    if (!key) throw new BadRequestException(ERROR_MESSAGES.UPLOAD_KEY_REQUIRED);
    assertValidKey(key);
    // third-service enforces ownership (the uploader, or ADMIN) and returns a short-lived presigned URL.
    const result = await this.rmqProducer.send<
      { url: string; expiresIn: number; contentType: string; filename: string },
      { key: string; userId: string; role: JwtGuardUser['role'] }
    >('upload.download', { key, userId: user.id, role: user.role });
    res.redirect(302, result.url);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Delete(':key')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Delete file' })
  @ApiParam({ name: 'key', type: String, description: 'R2 object key' })
  @SwaggerResponse({ status: 200, description: 'File deleted' })
  delete(@Param('key') key: string, @CurrentUser() user: JwtGuardUser) {
    assertValidKey(key);
    return this.rmqProducer.send('upload.delete', { key, role: user.role });
  }
}
