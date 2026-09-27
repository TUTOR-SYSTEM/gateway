// Must load env vars before any other import — `AppModule` transitively imports
// `rmq.constants.ts`, which reads `process.env.RABBITMQ_URL` at module top-level
// (evaluated during this static import chain, before `ConfigModule.forRoot()` ever
// runs inside `NestFactory.create()` below). Without this, RmqProducer's ClientProxy
// silently falls back to `amqp://guest:guest@localhost:5672` instead of the real URL.
import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ResponseInterceptor } from '@packages/interceptor/response.interceptor';
import { ErrorInterceptor, LoggerInterceptor } from '@packages/interceptor';
import { HttpExceptionFilter } from '@packages/filters';
import { requestContextMiddleware } from '@packages/context/request-context.middleware';
import { setLogSink } from '@packages/context/log-sink';
import { RmqProducer } from './features/rabbitmq/rmq.producer';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  // First in the chain: opens the AsyncLocalStorage context (correlationId/traceId/serviceName)
  // that every interceptor, guard, controller, and `RmqProducer.send()` call below reads from.
  app.use(requestContextMiddleware);

  app.enableCors({ origin: true, credentials: true });
  app.useGlobalInterceptors(new ResponseInterceptor(app.get(Reflector)));
  app.useGlobalInterceptors(new ErrorInterceptor(), new LoggerInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  // Ships every HTTP request row to third-service's `request_logs` table, fire-and-forget.
  const rmqProducer = app.get(RmqProducer);
  setLogSink((entry) => rmqProducer.emit('log.create', entry));

  const config = new DocumentBuilder()
    .setTitle('Backends API')
    .setDescription('API documentation for the Backends financial management system')
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
    // ── Finance Management ────────────────────────────
    .addTag('Categories')
    .addTag('Wallets')
    .addTag('Transactions')
    .addTag('Reports')
    // ── System ────────────────────────────────────────
    .addTag('Upload')
    .addTag('Cloudinary')
    .addTag('Health')
    .addTag('Redis')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = process.env.PORT ?? 8888;
  await app.listen(port);
  Logger.log(`[GATEWAY] listening on port ${port}`, 'Bootstrap');
}
void bootstrap();
