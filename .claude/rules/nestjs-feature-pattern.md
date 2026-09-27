# Rule: NestJS feature pattern (gateway)

Gateway is a thin HTTP edge with **no service or repository layer and no database** for any
feature — all business logic and each domain's Postgres schema live only in the service that
owns it (`user`, `tutor-service`, `third-service`). Every call to those services goes over
**RabbitMQ** (`@nestjs/microservices` RMQ transport, request/reply) through the shared
`RmqProducer` (`src/features/rabbitmq/`). See `[[rmq-rpc-plumbing]]` memory for the full
mechanism (routing, trace headers, error translation). History: gateway was split out of a
duplicate of `user` (`[[gateway-rmq-refactor]]`), moved to Kafka, and moved back to RabbitMQ
on 2026-09-27.

- **Layers**: `{name}.controller.ts` + `{name}.module.ts` only. No `{name}.service.ts`, no
  `{name}.repository.ts`. If a change needs new business logic, it goes in the owning service's
  `*.service.ts` behind a new `@MessagePattern`, not here.
- **Controller shape**: keep every route, guard (`@Public()`/`@Roles()`), Zod
  `ZodValidationPipe`, and Swagger decorator at the edge — validation and auth stay here. The
  handler body is:
  ```ts
  return this.rmqProducer.send('<feature>.<methodName>', payload);
  ```
  with `constructor(private readonly rmqProducer: RmqProducer) {}` (`RmqModule` is `@Global()`,
  so no module import needed). `RmqProducer.send()` is the only sanctioned way to call a
  downstream service — it adds trace headers, retries with backoff, and turns the responder's
  error payload back into the matching `HttpException`. Never inject a raw `ClientProxy` or call
  `client.send(...)` directly from a controller. Use `.emit()` only for fire-and-forget calls
  whose result nobody needs.
- **Routing**: `RmqProducer` picks the target queue from the pattern's first segment via
  `RMQ_PREFIX_ROUTES` in `src/features/rabbitmq/rmq.constants.ts` (`auth`/`user` → `user_queue`;
  education-domain features + `ai` → `tutor_queue`; `redis`/`email`/`notification`/`upload` →
  `third_queue`; full-pattern overrides in `RMQ_PATTERN_ROUTES`). **A new feature prefix must be
  added there** — an unknown prefix throws at call time instead of silently timing out.
- **Message pattern naming**: `<feature>.<methodName>`, matching the method name on the owning
  service's `*Service` class (e.g. `auth.login` → `AuthService.loginService`, `ai.chat` →
  `tutor-service`'s agents feature). The pattern is a literal string — there is no shared
  constant between repos, so when you add or rename a pattern, update **both** the gateway call
  site and the owning repo's `*.rpc.controller.ts` `@MessagePattern(...)` together, or the call
  gets a "no matching message handler" error.
- **Payload shape**: mirror exactly what the owning service's method already takes (see its
  `*.rpc.controller.ts`) — e.g. `{ id, role, data }` for `user.updateUser`. Build it from
  `@CurrentUser()` / `@Param()` / the validated body in the gateway controller.
- **Entities still live** under `src/packages/entities/{domain}/` as `{domain}.schema.ts` (Zod),
  `{domain}.dto.ts`, `index.ts` — gateway keeps these for request validation even without a DB.
- **OAuth is the one exception**: `AuthController`'s Google/Facebook routes keep their Passport
  `AuthGuard`/redirect logic here (they need a live `Response` for the browser redirect) — only
  the token-issuance call at the end (`auth.googleLogin`/`auth.facebookLogin`) goes over RPC.
- **Error messages**: use `ERROR_MESSAGES` constants from `src/data/constants/error.constant.ts`
  for anything gateway itself throws directly — errors coming back from the owning service
  already carry their own message and status through `RmqProducer.send()`.
- **Register** every new module in `src/app.module.ts` `imports: [...]`.
- **Route names are plural** (`@Controller('students')`); class/file names are singular.
