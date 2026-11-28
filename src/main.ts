import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ResponseInterceptor } from '@packages/interceptor/response.interceptor';
import { ErrorInterceptor } from '@packages/interceptor';
import { HttpExceptionFilter } from '@packages/filters';
import { requestContextMiddleware } from '@packages/context/request-context.middleware';
import { securityHeaders } from '@packages/helpers/security-headers.helper';

async function bootstrap() {
  if (!process.env.RPC_ACTOR_SECRET?.trim()) {
    throw new Error('RPC_ACTOR_SECRET must be set (shared with user-service)');
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 1);
  const hops = Number.isInteger(trustProxyHops) && trustProxyHops >= 0 ? trustProxyHops : 1;
  app.set('trust proxy', hops);

  Logger.log(
    `trust proxy hops = ${hops} (TRUST_PROXY_HOPS; set it to the number of proxies in front)`,
    'Bootstrap',
  );

  app.enableShutdownHooks();

  app.use(requestContextMiddleware);
  app.use(securityHeaders);

  // Production defaults to the public frontend only; localhost is a development-only origin.
  const defaultCorsOrigins =
    process.env.NODE_ENV === 'production'
      ? 'https://tutor.haiphan.org'
      : 'http://localhost:3000,https://tutor.haiphan.org';
  const corsOrigins = (process.env.CORS_ORIGINS ?? defaultCorsOrigins)
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins, credentials: true });
  app.useGlobalInterceptors(new ResponseInterceptor(app.get(Reflector)));
  app.useGlobalInterceptors(new ErrorInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  // Swagger lists every route, admin ones included: off in production unless explicitly enabled.
  if (process.env.NODE_ENV !== 'production' || process.env.SWAGGER_ENABLED === 'true') {
    const config = new DocumentBuilder()
      .setTitle('Tutor Management API')
      .setDescription('API documentation for the Tutor Management backend')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter JWT access token',
        },
        'access-token',
      )
      // ── Tutor Management ─────────────────────────────
      .addTag('Users')
      .addTag('Auth')
      .addTag('Students')
      .addTag('Curriculum')
      .addTag('Chapter')
      .addTag('Lesson')
      .addTag('Classes')
      .addTag('Schedules')
      .addTag('Sessions')
      .addTag('Exercises')
      .addTag('Tuitions')
      .addTag('Notifications')
      .addTag('Reports')
      // ── System ────────────────────────────────────────
      .addTag('Upload')
      .addTag('Health')
      .addTag('Redis')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api-docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }

  const port = process.env.PORT ?? 8888;
  await app.listen(port);
  Logger.log(`[GATEWAY] listening on port ${port}`, 'Bootstrap');
}
void bootstrap();
