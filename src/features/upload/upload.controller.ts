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
<<<<<<< Updated upstream
import { ERROR_MESSAGES } from 'src/data/constants';
import { RmqProducer } from '../rabbitmq/rmq.producer';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file
=======
import { Roles } from '@packages/decorators';
import { RolesGuard } from '@packages/guards';
import { ERROR_MESSAGES } from 'src/data/constants';
import { RmqProducer } from '../rabbitmq/rmq.producer';

const UPLOAD_KEY_PREFIX = 'uploads/';

/** Only keys under `uploads/` (the prefix the storage service writes) and without traversal are allowed. */
function assertValidKey(key: string): void {
  if (!key || !key.startsWith(UPLOAD_KEY_PREFIX) || key.includes('..') || key.includes('\\')) {
    throw new BadRequestException(ERROR_MESSAGES.UPLOAD_KEY_INVALID);
  }
}

/** Basename only, with quotes / CR / LF removed, safe for a Content-Disposition filename. */
function sanitizeFilename(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? '').replace(/["\r\n]/g, '');
  return base || 'download';
}
>>>>>>> Stashed changes

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
  upload(@UploadedFile() file: Express.Multer.File) {
<<<<<<< Updated upstream
    if (!file) throw new BadRequestException('File is required (multipart field)');
=======
    if (!file) throw new BadRequestException(ERROR_MESSAGES.UPLOAD_FILE_REQUIRED);
>>>>>>> Stashed changes
    return this.rmqProducer.send('upload.upload', {
      file: {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        buffer: file.buffer.toString('base64'),
      },
    });
  }

  @Post('multiple')
  @UseInterceptors(FilesInterceptor('files', 10, { limits: { fileSize: MAX_FILE_SIZE } }))
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
  uploadMultiple(@UploadedFiles() files: Express.Multer.File[]) {
<<<<<<< Updated upstream
    if (!files || files.length === 0) {
      throw new BadRequestException('File is required (multipart field)');
    }
=======
    if (!files?.length) throw new BadRequestException(ERROR_MESSAGES.UPLOAD_FILES_REQUIRED);
>>>>>>> Stashed changes
    return this.rmqProducer.send('upload.uploadMultiple', {
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
  async download(@Query('key') key: string, @Res() res: Response): Promise<void> {
    if (!key) throw new BadRequestException(ERROR_MESSAGES.UPLOAD_KEY_REQUIRED);
    assertValidKey(key);
    const result = await this.rmqProducer.send<
      { buffer: string; filename?: string },
      { key: string }
    >('upload.download', { key });
    const fileBuffer = Buffer.from(result.buffer, 'base64');
<<<<<<< Updated upstream
    const baseName = key.split('/').pop() || 'download';
    const safeName = baseName.replace(/[^A-Za-z0-9._-]/g, '_');
    res.set({ 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(baseName)}` });
    res.send(fileBuffer);
  }

=======
    const filename = sanitizeFilename(result.filename ?? key);
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(fileBuffer);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
>>>>>>> Stashed changes
  @Delete(':key')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Delete file' })
  @ApiParam({ name: 'key', type: String, description: 'R2 object key' })
  @SwaggerResponse({ status: 200, description: 'File deleted' })
  delete(@Param('key') key: string) {
    assertValidKey(key);
    return this.rmqProducer.send('upload.delete', { key });
  }
}
