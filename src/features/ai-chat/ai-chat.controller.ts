import { Body, Controller, Delete, Get, HttpCode, Post, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiQuery,
  ApiResponse as SwaggerResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { StatusCodes } from 'http-status-codes';
import { ZodValidationPipe } from '@packages/pipes';
import { CurrentUser } from '@packages/decorators';
import {
  chatSchema,
  getHistoryQuerySchema,
  type ChatDto,
  type GetHistoryQueryDto,
} from '@packages/entities/ai-chat';
import type { JwtGuardUser } from '@packages/guards/jwt-auth.guard';
import { RmqProducer } from '../rabbitmq/rmq.producer';

/**
 * Gateway is a thin HTTP edge for the AI assistant (`ai-chat`): validation/guards/Swagger stay,
 * every handler forwards to the owning service over RabbitMQ via `RmqProducer.send()`.
 */
@ApiTags('AI Chat')
@ApiBearerAuth('access-token')
@Controller('ai-chat')
export class AiChatController {
  constructor(private readonly rmqProducer: RmqProducer) {}

  @Post('chat')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Chat with AI assistant', description: 'Send a message and get a reply (history is DB-backed)' })
  @ApiBody({ schema: { type: 'object', required: ['message'] } })
  @SwaggerResponse({ status: 200, description: 'AI reply fetched' })
  chat(
    @Body(new ZodValidationPipe<ChatDto>(chatSchema)) dto: ChatDto,
    @CurrentUser() user: JwtGuardUser,
  ) {
    return this.rmqProducer.send('ai.chat', { userId: user.id, data: dto });
  }

  @Get('history')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Get AI chat history' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @SwaggerResponse({ status: 200, description: 'Chat history fetched' })
  getHistory(
    @Query(new ZodValidationPipe<GetHistoryQueryDto>(getHistoryQuerySchema))
    query: GetHistoryQueryDto,
    @CurrentUser() user: JwtGuardUser,
  ) {
    return this.rmqProducer.send('ai.history', { userId: user.id, query });
  }

  @Delete('history')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Clear AI chat history' })
  @SwaggerResponse({ status: 200, description: 'Chat history cleared' })
  clearHistory(@CurrentUser() user: JwtGuardUser) {
    return this.rmqProducer.send('ai.clearHistory', { userId: user.id });
  }
}