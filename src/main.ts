// Must load env vars before any other import — `AppModule` transitively imports
// `rmq.constants.ts`, which reads `process.env.RABBITMQ_URL` at module top-level
// (evaluated during this static import chain, before `ConfigModule.forRoot()` ever
// runs inside `NestFactory.create()` below). Without this, RmqProducer's ClientProxy
// silently falls back to `amqp://guest:guest@localhost:5672` instead of the real URL.
import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ResponseInterceptor } from '@packages/interceptor/response.interceptor';
import { ErrorInterceptor, LoggerInterceptor } from '@packages/interceptor';
import { HttpExceptionFilter } from '@packages/filters';
import { requestContextMiddleware } from '@packages/context/request-context.middleware';
import { setLogSink } from '@packages/context/log-sink';
import { RmqProducer } from './features/rabbitmq/rmq.producer';
import { securityHeaders } from '@packages/helpers/security-headers.helper';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });
  // Behind the platform proxy (Railway), req.ip is the proxy address unless the hop count is set:
  // without this, every client shares one rate-limit bucket. TRUST_PROXY_HOPS defaults to 1.
  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 1);
  app.set(
    'trust proxy',
    Number.isInteger(trustProxyHops) && trustProxyHops >= 0 ? trustProxyHops : 1,
  );
  // Lets Nest run onModuleDestroy (RMQ clients close) on SIGTERM/SIGINT instead of dropping
  // in-flight requests.
  app.enableShutdownHooks();

  // First in the chain: opens the AsyncLocalStorage context (correlationId/traceId/serviceName)
  // that every interceptor, guard, controller, and `RmqProducer.send()` call below reads from.
  app.use(requestContextMiddleware);
  app.use(securityHeaders);

  // Origin whitelist from CORS_ORIGINS (comma-separated). Dev default: local frontends only.
  const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins, credentials: true });
  app.useGlobalInterceptors(new ResponseInterceptor(app.get(Reflector)));
  app.useGlobalInterceptors(new ErrorInterceptor(), new LoggerInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  // Ships every HTTP request row to third-service's `request_logs` table, fire-and-forget.
  const rmqProducer = app.get(RmqProducer);
  setLogSink((entry) => rmqProducer.emit('log.create', entry));

  // The API schema is not published in production; it is served only in development/staging.
  if (process.env.NODE_ENV !== 'production') {
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
