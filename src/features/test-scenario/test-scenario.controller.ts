import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse as SwaggerResponse,
  ApiTags,
} from '@nestjs/swagger';
import { StatusCodes } from 'http-status-codes';
import { CurrentUser, Roles } from '@packages/decorators';
import { RolesGuard } from '@packages/guards';
import { ZodValidationPipe } from '@packages/pipes';
import type { JwtGuardUser } from '@packages/guards/jwt-auth.guard';
import {
  createTestScenarioSchema,
  getTestScenariosQuerySchema,
  updateTestScenarioSchema,
  type CreateTestScenarioDto,
  type GetTestScenariosQueryDto,
  type UpdateTestScenarioDto,
} from '@packages/entities/test-scenario';
import { RmqProducer } from '../rabbitmq/rmq.producer';

/**
 * Thin proxy onto third-service's test scenarios (admin only): CRUD the test cases of each
 * endpoint and fire one for real against this gateway.
 */
@ApiTags('Test Scenarios')
@ApiBearerAuth('access-token')
@UseGuards(RolesGuard)
@Roles('ADMIN')
@Controller('test-scenarios')
export class TestScenarioController {
  constructor(private readonly rmqProducer: RmqProducer) {}

  @Post()
  @HttpCode(StatusCodes.CREATED)
  @ApiOperation({ summary: 'Create a test scenario (admin only)' })
  @SwaggerResponse({ status: 201, description: 'Scenario created' })
  create(
    @Body(new ZodValidationPipe<CreateTestScenarioDto>(createTestScenarioSchema))
    dto: CreateTestScenarioDto,
  ) {
    return this.rmqProducer.send('testscenario.create', dto);
  }

  @Get()
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'List test scenarios with their latest run (admin only)' })
  @ApiQuery({ name: 'service', required: false, type: String })
  @ApiQuery({ name: 'method', required: false, type: String })
  @ApiQuery({ name: 'path', required: false, type: String })
  @ApiQuery({
    name: 'category',
    required: false,
    enum: ['valid', 'auth', 'validation', 'not_found', 'domain'],
  })
  @SwaggerResponse({ status: 200, description: 'Scenarios fetched' })
  list(
    @Query(new ZodValidationPipe<GetTestScenariosQueryDto>(getTestScenariosQuerySchema))
    query: GetTestScenariosQueryDto,
  ) {
    return this.rmqProducer.send('testscenario.list', query);
  }

  @Get('meta')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    summary: 'Runtime metadata for the test monitor (admin only)',
    description: 'Returns the deployment environment name from env APP_ENV (fallback NODE_ENV).',
  })
  @SwaggerResponse({ status: 200, description: 'Meta fetched' })
  meta(): { environment: string } {
    return {
      environment: process.env.APP_ENV?.trim() || process.env.NODE_ENV?.trim() || 'development',
    };
  }

  @Get('stats')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    summary: 'Cases passed / total per endpoint (admin only)',
    description: 'Grouped by (method, path); a case passes when its latest run passed.',
  })
  @SwaggerResponse({ status: 200, description: 'Scenario stats fetched' })
  stats() {
    return this.rmqProducer.send('testscenario.stats', {});
  }

  @Patch(':id')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Update a test scenario (admin only)' })
  @ApiParam({ name: 'id', type: String })
  @SwaggerResponse({ status: 200, description: 'Scenario updated' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe<UpdateTestScenarioDto>(updateTestScenarioSchema))
    dto: UpdateTestScenarioDto,
  ) {
    return this.rmqProducer.send('testscenario.update', { id, dto });
  }

  @Delete(':id')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Delete a test scenario (admin only)' })
  @ApiParam({ name: 'id', type: String })
  @SwaggerResponse({ status: 200, description: 'Scenario deleted' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rmqProducer.send('testscenario.delete', { id });
  }

  @Post(':id/run')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    summary: 'Run a test scenario against this gateway (admin only)',
    description:
      'Fires the scenario\'s request for real with a fresh x-correlation-id, so it appears in ' +
      '/logs like any other request. `{{accessToken}}` in template headers is replaced by the ' +
      'caller\'s token. Returns the recorded run (incl. correlationId and pass/fail).',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiQuery({
    name: 'async',
    required: false,
    type: Boolean,
    description:
      'true → return { correlationId } immediately and finish in the background (follow the trace live over the /logs socket)',
  })
  @SwaggerResponse({ status: 200, description: 'Scenario executed' })
  run(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtGuardUser,
    @Headers('authorization') authorization?: string,
    @Query('async') asyncMode?: string,
  ) {
    const accessToken = authorization?.replace(/^Bearer\s+/i, '');
    return this.rmqProducer.send('testscenario.run', {
      id,
      userId: user.id,
      accessToken,
      wait: asyncMode !== 'true',
    });
  }
}
