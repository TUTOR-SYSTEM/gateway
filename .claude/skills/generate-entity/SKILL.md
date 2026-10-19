---
name: generate-entity
description: Scaffold the entities layer for a domain — Zod v4 schema (create + partial update + paginated query), inferred DTOs, and index barrel — under src/packages/entities/{domain}/. Use when asked to create/add DTOs, Zod schemas, or validation for a feature in this NestJS tutoring backend.
---

# Generate Entity (Zod schema + DTO)

Create `src/packages/entities/{domain}/` for a domain named `foo`. The `class` entities this
skill originally mirrored were removed in a 2026-09-12 trim — use the shape below as the
template; `src/packages/entities/student/` and `src/packages/entities/admin/` are the closest
surviving examples, though neither strictly does `updateFooSchema = createFooSchema.partial()`
(they define update schemas by hand / via `.extend()`), so follow the shape below over those
two where they diverge.

## Inputs
- Domain name (singular, lowercase), e.g. `session`.
- Fields with validation (min/max/uuid/enum/url/regex/optional/nullable/default).

## Files

### `foo.schema.ts`
Zod v4. Export:
- Shared enums first, e.g. `export const fooStatusEnum = z.enum(['OPEN', 'CLOSED']);`
- `createFooSchema = z.object({ ... })` — one rule per field, friendly messages matching the
  existing `student.schema.ts` style (e.g. `z.string({ message: 'Name is required' })`).
  Body numbers use plain `z.number()` (coerce turns `""`/`null` into `0`); `z.coerce` only for
  query strings (see the pagination shape below). Dates: `z.coerce.date()` only when the input
  is a string. UUID FKs with `.uuid('Invalid tutor ID')`.
- `updateFooSchema = createFooSchema.partial()` (`.omit({ ... })` any immutable field). **Zod 4
  `.partial()` keeps `.default(...)`** — re-declare each defaulted field without a default via
  `.extend({ field: <type>.optional() })`, because gateway forwards the already-parsed DTO and an
  injected default would overwrite stored data (see `updateClassSchema` / `updateTuitionSchema`).
- `getFoosQuerySchema = z.object({ ... })` — plain `z.coerce` pagination, copy the shape from
  `student.schema.ts` / `user.schema.ts`:
  ```ts
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().min(1).optional(),
  // + any filter fields (status enum, subject, foreign-key ids as .uuid().optional())
  ```
  Do NOT use `z.preprocess` — that was the old finance-tracker style.

### `foo.dto.ts`
```ts
import { z } from 'zod';
import { createFooSchema, getFoosQuerySchema } from './foo.schema';

export type CreateFooDto = z.infer<typeof createFooSchema>;
export type UpdateFooDto = Partial<z.infer<typeof createFooSchema>>;
export type GetFoosQueryDto = z.infer<typeof getFoosQuerySchema>;
```
Add a hand-written `FooDetailDto` type only if the detail endpoint returns computed fields
not present on the base row (e.g. counts or joined summary data).

### `index.ts`
```ts
export * from './foo.schema';
export * from './foo.dto';
```

## Rules
- Single quotes, trailing commas, 100-char width.
- Export reused enums as `z.enum([...])` (see `userRoleEnum` / `genderEnum`). Gateway has no
  local `schema.ts`/`pgEnum` (no database here) — the enum's source of truth is the owning
  service's `src/database/schema.ts` in its own repo; keep the value lists in sync with that.
- Consumed by controllers via `new ZodValidationPipe<Dto>(schema)` — keep export names stable.
