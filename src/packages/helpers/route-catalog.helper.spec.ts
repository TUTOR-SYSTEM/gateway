import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { DiscoveryModule, DiscoveryService } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Public, Roles } from '@packages/decorators';
import { ZodValidationPipe } from '@packages/pipes';
import { listHttpRoutes } from './route-catalog.helper';

const createSchema = z.object({ name: z.string().min(2), size: z.number().int().optional() });
const listSchema = z.object({ status: z.enum(['OPEN', 'CLOSED']).optional() });

@ApiTags('Things')
@Controller('things')
class ThingController {
  @Get()
  @ApiOperation({ summary: 'List things' })
  list(@Query(new ZodValidationPipe(listSchema)) query: unknown) {
    return query;
  }

  @Post()
  create(@Body(new ZodValidationPipe(createSchema)) body: unknown) {
    return body;
  }

  @Get(':id/parts/:partId')
  @Roles('ADMIN', 'TUTOR')
  part(@Param('id', ParseUUIDPipe) id: string, @Param('partId') partId: string) {
    return { id, partId };
  }

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  upload() {
    return 'ok';
  }
}

@Public()
@Controller('auth')
class AuthLikeController {
  @Get('google/callback')
  google() {
    return 'ok';
  }
}

describe('listHttpRoutes', () => {
  it('reads auth, params and the Zod schemas of every route', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DiscoveryModule],
      controllers: [ThingController, AuthLikeController],
    }).compile();
    const routes = listHttpRoutes(moduleRef.get(DiscoveryService));
    const byKey = Object.fromEntries(routes.map((r) => [`${r.method} ${r.path}`, r]));

    expect(byKey['GET /things']).toMatchObject({
      summary: 'List things',
      tag: 'Things',
      isPublic: false,
      roles: null,
      bodySchema: null,
    });
    expect(byKey['GET /things'].querySchema?.properties).toMatchObject({
      status: { enum: ['OPEN', 'CLOSED'] },
    });
    expect(byKey['POST /things'].bodySchema).toMatchObject({
      type: 'object',
      required: ['name'],
      properties: { name: { type: 'string', minLength: 2 }, size: { type: 'integer' } },
    });
    expect(byKey['GET /things/:id/parts/:partId']).toMatchObject({
      params: ['id', 'partId'],
      uuidParams: ['id'],
      roles: ['ADMIN', 'TUTOR'],
    });
    expect(byKey['POST /things/upload'].multipart).toBe(true);
    expect(byKey['GET /auth/google/callback']).toMatchObject({ isPublic: true, oauth: true });
  });
});
