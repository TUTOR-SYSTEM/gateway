import { Body, Controller, Get, HttpCode, Param, Put, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse as SwaggerResponse,
  ApiTags,
} from '@nestjs/swagger';
import { StatusCodes } from 'http-status-codes';
import { ZodValidationPipe } from '@packages/pipes';
import { CurrentUser } from '@packages/decorators';
import {
  API_CATALOG_VIEWS,
  apiCatalogQuerySchema,
  apiRouteIdSchema,
  saveApiRouteResultSchema,
  type ApiCatalogQueryDto,
  type SaveApiRouteResultDto,
} from '@packages/entities/api-routes';
import type { JwtGuardUser } from '@packages/guards/jwt-auth.guard';
import { ApiRoutesService } from './api-routes.service';

/** Kết quả test/tick của tab API Route Checklist, lưu ở tutor-service (bảng api_route_results). */
@ApiTags('API routes')
@ApiBearerAuth('access-token')
@Controller('api-routes')
export class ApiRoutesController {
  constructor(private readonly apiRoutesService: ApiRoutesService) {}

  @Get('catalog')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    summary:
      'Get API route catalogue. view=module: gom theo module · view=feature: gom theo feature (module của từng repo nằm trong feature)',
  })
  @ApiQuery({ name: 'view', required: false, enum: API_CATALOG_VIEWS })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Catalogue fetched' })
  getCatalog(
    @Query(new ZodValidationPipe<ApiCatalogQueryDto>(apiCatalogQuerySchema))
    query: ApiCatalogQueryDto,
  ) {
    return this.apiRoutesService.getCatalogService(query);
  }

  @Get('results')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'List API route check results' })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Results fetched' })
  getResults(@CurrentUser() user: JwtGuardUser) {
    return this.apiRoutesService.getResultsService(user.id);
  }

  @Put('results/:id')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Save check result of one API route' })
  @SwaggerResponse({ status: StatusCodes.OK, description: 'Result saved' })
  saveResult(
    @Param('id') id: string,
    @Body(new ZodValidationPipe<SaveApiRouteResultDto>(saveApiRouteResultSchema))
    body: SaveApiRouteResultDto,
    @CurrentUser() user: JwtGuardUser,
  ) {
    const routeId = apiRouteIdSchema.parse(id);
    return this.apiRoutesService.saveResultService(user.id, routeId, body);
  }
}
