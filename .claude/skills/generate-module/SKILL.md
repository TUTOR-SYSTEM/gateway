---
name: generate-module
description: Scaffold the NestJS module (src/features/{name}/{name}.module.ts) and wire it into src/app.module.ts imports. Use when asked to create/add a module or register a feature in this NestJS tutoring backend.
---

# Generate Module + Wire

Create `src/features/foo/foo.module.ts` and register it in `app.module.ts`. Gateway modules are
trivial: a feature is a thin RPC-proxy controller with **no service, no repository** — see
`.claude/rules/nestjs-feature-pattern.md`.

## Prerequisites
Controller exists for the feature (see `generate-controller`).

## `foo.module.ts` (see `src/features/admin/admin.module.ts` or `src/features/email/email.module.ts`
for real examples)
```ts
import { Module } from '@nestjs/common';
import { FooController } from './foo.controller';

@Module({
  controllers: [FooController],
})
export class FooModule {}
```
No `providers` array is needed for the RPC client: `RmqModule` (`src/features/rabbitmq/`) is
`@Global()` and exports `RmqProducer`, so it can be injected in any controller without listing it
in `imports`. Only add `imports`/`providers` here if
the feature genuinely needs something feature-local (rare — check with the user first).

## Wiring `src/app.module.ts` (required)
1. Add `import { FooModule } from './features/foo/foo.module';` with the other feature imports.
2. Add `FooModule` into the `imports: [...]` array, grouped near related feature modules.

## After
Run `bun run build` (or `bunx tsc --noEmit`) to confirm the module resolves and DI compiles.

## Not for infra modules
This scaffold is for domain feature modules. `RmqModule` is a
`@Global()` infra module with no controller — don't regenerate those from this skill.
