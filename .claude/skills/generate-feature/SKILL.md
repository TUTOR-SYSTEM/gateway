---
name: generate-feature
description: Scaffold a complete gateway feature (Zod entity schema/dto, thin RPC-proxy controller, module) and wire it into app.module.ts. Use when the user asks to "create a feature", "generate a feature", "add a new module/CRUD endpoint", or "scaffold" for this NestJS gateway.
---

# Generate Gateway Feature

Scaffold a full gateway feature. Gateway owns **no database and no business logic** — a
"feature" here is validation + a thin RPC-proxy controller that forwards to whichever service
actually owns the domain (`user`, `tutor-service`, or `third-service`). See
`.claude/rules/nestjs-feature-pattern.md` and `../.claude/rules/architecture.md`.

**If the business logic doesn't exist yet in the owning service**, this skill only covers the
gateway half. Use the root `add-rpc-endpoint` skill instead (or in addition) — it scaffolds both
the gateway call site *and* the owning service's `@MessagePattern` handler together, which is
almost always what "add a new feature end-to-end" actually means.

## Inputs

Ask the user (or infer from the request) before generating:

1. **Feature name** — singular, lowercase (e.g. `session`). Controller route is the plural (`sessions`).
2. **Fields** — name, type, required/optional, validation (min/max/uuid/enum/url/regex).
3. **Which service owns this domain** — `user` (auth/user/admin/student), `tutor-service`
   (education domain), or `third-service` (email/notification/redis/upload) — this decides which
   `ClientProxy` token the controller injects.
4. **The RPC pattern name(s)** this feature will call, e.g. `foo.create`/`foo.list` — must match
   (or will become, via `add-rpc-endpoint`) the owning service's `@MessagePattern(...)` strings.

If fields are unclear, propose a sensible set and confirm before writing files.

**Before scaffolding**: if the feature introduces a new pattern prefix, add it to
`RMQ_PREFIX_ROUTES` in `src/features/rabbitmq/rmq.constants.ts` so `RmqProducer` knows which
queue to send to.

## Composition — run the layer skills in order

This is the orchestrator for gateway's two real layers:

1. **generate-entity** — Zod schema + DTOs under `src/packages/entities/{name}/`.
2. **generate-controller** — thin RPC-proxy routes + Swagger, one `this.rmqProducer.send(...)` per route.
3. **generate-module** — module file (controller only) + wire into `app.module.ts`.

`generate-service`, `generate-repository`, and `generate-db-table` **do not apply to gateway**
(no service/repository/database layer here) — they exist only so the same skill names resolve
correctly when working from the owning service's own repo. Don't run them here.

## Naming conventions

For a feature named `foo`:

- Folder: `src/features/foo/`
- Class prefix: `Foo` → `FooController`, `FooModule` (no `FooService`/`FooRepository`)
- Route: `@Controller('foos')` (plural)
- Entities: `src/packages/entities/foo/` with `foo.schema.ts`, `foo.dto.ts`, `index.ts`
- RPC patterns: `foo.<methodName>` (e.g. `foo.create`, `foo.list`, `foo.get`, `foo.delete`)

## Shape to match

- **Entity** — `createFooSchema`, `updateFooSchema = createFooSchema.partial()`,
  `getFoosQuerySchema` using plain `z.coerce` pagination (NOT `z.preprocess`).
- **Controller** — `@ApiTags`, `@ApiBearerAuth('access-token')`, `@Controller('foos')`,
  `@Inject(<SERVICE>) private readonly <name>Client: ClientProxy`, `@CurrentUser()` for the
  acting user, `ZodValidationPipe` for every body/query, inline Swagger schema constants,
  handler bodies that are exactly `return this.rmqProducer.send('<pattern>', payload);`.
- **Module** — `{ controllers: [FooController] }`, nothing else (see `generate-module`).

## Wiring (required)

**`src/app.module.ts`** — add `import { FooModule } from './features/foo/foo.module';` and
insert `FooModule` into the `imports: [...]` array (near related feature modules).

## After generating

1. Run `bun run lint:check` and `bun run build` (or `bunx tsc --noEmit`) to confirm it compiles.
2. Report exactly which files were created/modified, and whether the RPC patterns used already
   exist as `@MessagePattern` handlers in the owning repo — if not, say so explicitly (the user
   needs `add-rpc-endpoint`, or a separate change in that repo).
3. Do NOT invent helpers — reuse `RmqProducer` (`src/features/rabbitmq/`), `ZodValidationPipe`
   (`@packages/pipes`), `@CurrentUser` / `@Public` / `@Roles` (`@packages/decorators`) that
   already exist. There is no `@Admin()` decorator.
