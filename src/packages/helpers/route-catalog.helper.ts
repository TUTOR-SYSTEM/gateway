import { ParseUUIDPipe, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import { z, type ZodType } from 'zod';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ZodValidationPipe } from '../pipes';

/** Metadata keys written by `@nestjs/swagger` (`ApiOperation` / `ApiTags` / `ApiConsumes`). */
const SWAGGER_OPERATION_KEY = 'swagger/apiOperation';
const SWAGGER_TAGS_KEY = 'swagger/apiUseTags';
const SWAGGER_CONSUMES_KEY = 'swagger/apiConsumes';

/** OAuth redirect routes (Passport `AuthGuard('google' | 'facebook')`) can't be driven by a test. */
const OAUTH_PATH = /\/(google|facebook)(\/|$)/;

export type JsonSchema = Record<string, unknown>;

export type RouteInfo = {
  method: string;
  path: string;
  summary: string | null;
  tag: string | null;
  /** Path parameter names in order (`/classes/:id/students/:studentId` → `['id', 'studentId']`). */
  params: string[];
  /** Params validated by `ParseUUIDPipe` — a non-UUID value there is a 400. */
  uuidParams: string[];
  /** `@Public()` — reachable without a token. */
  isPublic: boolean;
  /** `@Roles(...)` on the handler or controller; `null` = any authenticated role. */
  roles: string[] | null;
  /** JSON Schema of the body/query `ZodValidationPipe` (input side); `null` when unvalidated. */
  bodySchema: JsonSchema | null;
  querySchema: JsonSchema | null;
  /** `multipart/form-data` upload — its body can't be generated as JSON. */
  multipart: boolean;
  /** OAuth redirect route — excluded from generated cases. */
  oauth: boolean;
};

type RouteArg = { index: number; data?: unknown; pipes?: unknown[] };

/** Input-side JSON Schema of a Zod schema; `null` if Zod can't express it. */
function toJsonSchema(schema: ZodType): JsonSchema | null {
  try {
    return z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
  } catch {
    return null;
  }
}

function zodSchemaOf(pipes: unknown[] | undefined): ZodType | null {
  const pipe = pipes?.find((p) => p instanceof ZodValidationPipe);
  // `schema` is private on the pipe, but it is exactly what validates this argument.
  return pipe ? ((pipe as unknown as { schema: ZodType }).schema ?? null) : null;
}

const isUuidPipe = (pipe: unknown) => pipe === ParseUUIDPipe || pipe instanceof ParseUUIDPipe;

/** What the handler's `@Body()`/`@Query()`/`@Param()` decorators validate. */
function argumentsOf(controller: object, methodName: string) {
  const args = (Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, methodName) ?? {}) as Record<
    string,
    RouteArg
  >;

  let bodySchema: JsonSchema | null = null;
  let querySchema: JsonSchema | null = null;
  const uuidParams: string[] = [];
  for (const [key, arg] of Object.entries(args)) {
    const type = Number(key.split(':')[0]);
    if (type === Number(RouteParamtypes.BODY)) {
      const schema = zodSchemaOf(arg.pipes);
      if (schema) bodySchema = toJsonSchema(schema);
    } else if (type === Number(RouteParamtypes.QUERY) && arg.data === undefined) {
      const schema = zodSchemaOf(arg.pipes);
      if (schema) querySchema = toJsonSchema(schema);
    } else if (type === Number(RouteParamtypes.PARAM) && typeof arg.data === 'string') {
      if (arg.pipes?.some(isUuidPipe)) uuidParams.push(arg.data);
    }
  }
  return { bodySchema, querySchema, uuidParams };
}

/**
 * Lists every HTTP route this gateway exposes by reading the Nest controllers' metadata, so the
 * list never drifts from the code — including what a test generator needs: auth (`@Public`,
 * `@Roles`), UUID path params and the Zod schemas of body/query. RabbitMQ `@MessagePattern`
 * handlers are skipped.
 */
export function listHttpRoutes(discovery: DiscoveryService): RouteInfo[] {
  const scanner = new MetadataScanner();
  const routes = new Map<string, RouteInfo>();

  for (const wrapper of discovery.getControllers()) {
    const instance = wrapper.instance as object | null;
    const metatype = wrapper.metatype as (abstract new (...args: never[]) => unknown) | null;
    if (!instance || !metatype) continue;

    const controllerPath = (Reflect.getMetadata(PATH_METADATA, metatype) as string | undefined) ?? '';
    const tags = Reflect.getMetadata(SWAGGER_TAGS_KEY, metatype) as string[] | undefined;
    const tag = tags?.[0] ?? null;
    const controllerPublic = Reflect.getMetadata(IS_PUBLIC_KEY, metatype) === true;
    const controllerRoles = Reflect.getMetadata(ROLES_KEY, metatype) as string[] | undefined;
    const prototype = Object.getPrototypeOf(instance) as Record<string, unknown>;

    for (const name of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[name] as object;
      const httpMethod = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (httpMethod === undefined || RequestMethod[httpMethod] === undefined) continue;

      const method = RequestMethod[httpMethod];
      const handlerPath = (Reflect.getMetadata(PATH_METADATA, handler) as string | undefined) ?? '';
      const path = joinPath(controllerPath, handlerPath);
      const operation = Reflect.getMetadata(SWAGGER_OPERATION_KEY, handler) as
        | { summary?: string }
        | undefined;
      const consumes = Reflect.getMetadata(SWAGGER_CONSUMES_KEY, handler) as string[] | undefined;
      // Same precedence as the guards (`getAllAndOverride`): handler first, then controller.
      const handlerRoles = Reflect.getMetadata(ROLES_KEY, handler) as string[] | undefined;
      const handlerPublic = Reflect.getMetadata(IS_PUBLIC_KEY, handler) as boolean | undefined;

      const key = `${method} ${path}`;
      if (routes.has(key)) continue;
      routes.set(key, {
        method,
        path,
        summary: operation?.summary ?? null,
        tag,
        params: [...path.matchAll(/:(\w+)/g)].map((m) => m[1]),
        isPublic: handlerPublic ?? controllerPublic,
        roles: handlerRoles ?? controllerRoles ?? null,
        multipart: consumes?.includes('multipart/form-data') ?? false,
        oauth: OAUTH_PATH.test(path),
        ...argumentsOf(metatype, name),
      });
    }
  }

  return [...routes.values()].sort(
    (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
  );
}

/** Joins a controller prefix and a method path into `/segment/...` with no trailing slash. */
function joinPath(...parts: string[]): string {
  const joined = parts
    .flatMap((part) => part.split('/'))
    .filter((segment) => segment.length > 0)
    .join('/');
  return `/${joined}`;
}
