import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseIntPipe,
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
  bulkCreateTestScenariosSchema,
  createTestFixtureSchema,
  createTestScenarioSchema,
  generateTestScenariosSchema,
  getTestScenariosQuerySchema,
  updateTestFixtureSchema,
  updateTestScenarioSchema,
  type BulkCreateTestScenariosDto,
  type CreateTestFixtureDto,
  type CreateTestScenarioDto,
  type GenerateTestScenariosBodyDto,
  type GetTestScenariosQueryDto,
  type UpdateTestFixtureDto,
  type UpdateTestScenarioDto,
} from '@packages/entities/test-scenario';
import { DiscoveryService } from '@nestjs/core';
import { listHttpRoutes } from '@packages/helpers';
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
  constructor(
    private readonly rmqProducer: RmqProducer,
    private readonly discovery: DiscoveryService,
  ) {}

  @Get('routes')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    summary: 'List every HTTP route exposed by this gateway (admin only)',
    description:
      'Read from the registered Nest controllers, so it always matches the running code. Used by the test-monitor page to show endpoints that have no scenario yet.',
  })
  @SwaggerResponse({ status: 200, description: 'Routes fetched' })
  routes() {
    return listHttpRoutes(this.discovery);
  }

  @Post('generate')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    summary: 'Propose test cases for gateway routes (admin only)',
    description:
      'Reads each route\'s metadata here (`@Public`, `@Roles`, `ParseUUIDPipe` params, body/query Zod schemas) and lets third-service derive the auth/validation/not-found/valid case matrix. Nothing is saved — send the chosen ones to `POST /test-scenarios/bulk`. Defaults to every route except this monitor\'s own.',
  })
  @SwaggerResponse({ status: 200, description: 'Proposed scenarios + fixtures they need' })
  generate(
    @Body(new ZodValidationPipe<GenerateTestScenariosBodyDto>(generateTestScenariosSchema))
    dto: GenerateTestScenariosBodyDto,
  ) {
    const all = listHttpRoutes(this.discovery);
    const wanted = dto.routes ? new Set(dto.routes.map((r) => `${r.method} ${r.path}`)) : null;
    const routes = all.filter((r) =>
      wanted ? wanted.has(`${r.method} ${r.path}`) : !r.path.startsWith('/test-scenarios'),
    );
    // The full list rides along so fixtures can be matched to their collection route.
    const listRoutes = all.filter((r) => r.method === 'GET' && r.params.length === 0);
    return this.rmqProducer.send('testscenario.generate', {
      routes,
      listRoutes,
      categories: dto.categories,
    });
  }

  @Post('bulk')
  @HttpCode(StatusCodes.CREATED)
  @ApiOperation({
    summary: 'Create many test scenarios at once (admin only)',
    description: 'Cases whose method + path + name already exist are skipped.',
  })
  @SwaggerResponse({ status: 201, description: '{ created, skipped }' })
  bulkCreate(
    @Body(new ZodValidationPipe<BulkCreateTestScenariosDto>(bulkCreateTestScenariosSchema))
    dto: BulkCreateTestScenariosDto,
  ) {
    return this.rmqProducer.send('testscenario.createMany', dto);
  }

  @Get('auth-profiles')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    summary: 'Which per-role test accounts are configured (admin only)',
    description:
      'One row per profile (admin/tutor/student/parent) from third-service env `TEST_ACCOUNT_<ROLE>`; shows the email, never the password.',
  })
  @SwaggerResponse({ status: 200, description: 'Auth profiles fetched' })
  authProfiles() {
    return this.rmqProducer.send('testscenario.authprofiles', {});
  }

  @Get('fixtures')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'List test fixtures — values for `{{fixture.<key>}}` (admin only)' })
  @SwaggerResponse({ status: 200, description: 'Fixtures fetched' })
  listFixtures() {
    return this.rmqProducer.send('testscenario.fixtures.list', {});
  }

  @Post('fixtures')
  @HttpCode(StatusCodes.CREATED)
  @ApiOperation({
    summary: 'Create a test fixture (admin only)',
    description:
      'Either a fixed `value`, or a `resolver` ({ path, authProfile, extract }) fetched through the gateway on first use.',
  })
  @SwaggerResponse({ status: 201, description: 'Fixture created' })
  @SwaggerResponse({ status: 409, description: 'Key already exists' })
  createFixture(
    @Body(new ZodValidationPipe<CreateTestFixtureDto>(createTestFixtureSchema))
    dto: CreateTestFixtureDto,
  ) {
    return this.rmqProducer.send('testscenario.fixtures.create', dto);
  }

  @Patch('fixtures/:id')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Update a test fixture (admin only)' })
  @ApiParam({ name: 'id', type: String })
  @SwaggerResponse({ status: 200, description: 'Fixture updated' })
  updateFixture(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe<UpdateTestFixtureDto>(updateTestFixtureSchema))
    dto: UpdateTestFixtureDto,
  ) {
    return this.rmqProducer.send('testscenario.fixtures.update', { id, dto });
  }

  @Delete('fixtures/:id')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Delete a test fixture (admin only)' })
  @ApiParam({ name: 'id', type: String })
  @SwaggerResponse({ status: 200, description: 'Fixture deleted' })
  deleteFixture(@Param('id', ParseUUIDPipe) id: string) {
    return this.rmqProducer.send('testscenario.fixtures.delete', { id });
  }

  @Post('fixtures/:id/resolve')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    summary: 'Resolve a test fixture now (admin only)',
    description: 'Refetches a resolver fixture and caches the new value; a fixed fixture is returned as is.',
  })
  @ApiParam({ name: 'id', type: String })
  @SwaggerResponse({ status: 200, description: 'Fixture resolved' })
  @SwaggerResponse({ status: 400, description: 'The resolver request or extract path failed' })
  resolveFixture(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = authorization?.replace(/^Bearer\s+/i, '');
    return this.rmqProducer.send('testscenario.fixtures.resolve', { id, accessToken });
  }

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

  @Get(':id/runs')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    summary: 'Run history of a test scenario, newest first (admin only)',
    description: 'Each run carries its status verdict and the (redacted, truncated) response body.',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '1–100, default 20' })
  @SwaggerResponse({ status: 200, description: 'Runs fetched' })
  runs(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.rmqProducer.send('testscenario.runs', { id, limit });
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
