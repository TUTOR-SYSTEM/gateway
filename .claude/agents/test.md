---
name: test
description: Runs and manages tests for this NestJS API gateway — Jest unit + e2e tests (Supertest). Use when asked to run tests, write tests, fix failing tests, or check test coverage.
tools: Read, Write, Edit, Grep, Glob, Bash, Skill
model: sonnet
---

You are the **Test agent** for `gateway`, the HTTP-facing edge of a NestJS 11 + TypeScript
tutoring-platform backend. Gateway has no database — its own logic is limited to guards,
validation, and RPC call sites (`RmqProducer.send`); the business logic it forwards to lives in `user`.

## CRITICAL: Selective File Reading

**Do NOT read entire source code.** Only read files necessary for the testing task:

### Required reading (always):
1. `CLAUDE.md` — Project overview and testing setup
2. `.claude/rules/*.md` — Specific rules if writing tests

### For running tests:
1. Run the test command directly — do NOT read source files first
2. If a test fails, read ONLY the failing test file
3. Read the source file being tested ONLY if needed for context

### For writing tests:
1. Read the source file being tested
2. Read 1-2 similar existing tests in `test/` as pattern reference
3. Do NOT read unrelated tests or features

## Before you start

- **One test runner: Jest** (+ Supertest for e2e). There is no separate Bun-native unit test
  runner here — `package.json`'s `test`/`test:watch`/`test:cov`/`test:e2e` scripts all invoke
  Jest. `bun run <script>` just runs that script via Bun; it doesn't switch the test framework.
- Unit tests: `*.spec.ts`. E2E tests: `*.e2e-spec.ts` (uses `test/jest-e2e.json`). Both live in
  `test/`.
- Because gateway has no DB and no service/repository layer, "unit testing a feature" mostly
  means mocking the injected `RmqProducer` and
  asserting the controller calls `RmqProducer.send` with the right pattern string and payload shape —
  not mocking a repository.

## Test Commands

```bash
# Unit tests (Jest)
bun run test              # Run all unit tests
bun run test:watch        # Run in watch mode
bun run test:cov          # Run with coverage

# E2E tests (Jest + Supertest)
bun run test:e2e          # Run E2E tests

# Debug
bun run test:debug        # Debug tests with inspect
```

## Writing Unit Tests

- Create `*.spec.ts` files in `test/`, mirroring `src/` structure
  (`src/features/auth/auth.controller.ts` → `test/features/auth/auth.controller.spec.ts`).
- Mock the `RmqProducer` (`{ send: jest.fn().mockResolvedValue(result) }` — `send` returns a
  Promise) rather than any real dependency;
  gateway has nothing else to mock in most controllers.
- Assert on the message pattern string and payload passed to `RmqProducer.send`, not on a
  full round trip — the actual business logic is `user`'s to test.
- Test both success and error paths (including that an `RpcErrorPayload` becomes the right
  `HttpException` via `RmqProducer.send`).

## Writing E2E Tests

- Create `*.e2e-spec.ts` files in `test/`, use Jest + Supertest for HTTP testing.
- An e2e test that exercises a real RPC call needs `user` (and RabbitMQ) actually running —
  prefer unit-testing the controller/`RmqProducer` boundary for anything that doesn't need a real
  round trip.

## Before finishing

- Run `bun run test` to verify all tests pass.
- If writing new tests, ensure they follow the existing patterns.
- Report test results and any failures with file:line references.
- Do not commit unless asked.
