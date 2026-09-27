import {
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
import { Public } from '@packages/decorators';
import { RmqProducer } from '../rabbitmq/rmq.producer';

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

  @Public()
  @Post()
  @UseInterceptors(FileInterceptor('file'))
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
    return this.rmqProducer.send('upload.upload', {
      file: {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        buffer: file.buffer.toString('base64'),
      },
    });
  }

  @Public()
  @Post('multiple')
  @UseInterceptors(FilesInterceptor('files', 10))
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
    return this.rmqProducer.send('upload.uploadMultiple', {
      files: files.map((file) => ({
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        buffer: file.buffer.toString('base64'),
      })),
    });
  }

  @Public()
  @Get('download')
  @ApiOperation({ summary: 'Download file', description: 'Stream a file from Cloudflare R2 by its key' })
  @ApiQuery({ name: 'key', required: true, description: 'R2 object key (e.g. uploads/uuid.jpg)' })
  @SwaggerResponse({ status: 200, description: 'File stream' })
  @SwaggerResponse({ status: 400, description: 'key query param missing' })
  @SwaggerResponse({ status: 404, description: 'File not found in R2' })
  async download(@Query('key') key: string, @Res() res: Response): Promise<void> {
    const result = await this.rmqProducer.send<{ buffer: string }, { key: string }>('upload.download', { key });
    const fileBuffer = Buffer.from(result.buffer, 'base64');
    res.set({ 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${key}"` });
    res.send(fileBuffer);
  }

  @Public()
  @Delete(':key')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Delete file' })
  @ApiParam({ name: 'key', type: String, description: 'R2 object key' })
  @SwaggerResponse({ status: 200, description: 'File deleted' })
  delete(@Param('key') key: string) {
    return this.rmqProducer.send('upload.delete', { key });
  }
}