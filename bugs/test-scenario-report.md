# Flow review: test-scenario

- Luồng: UI (`ui/lib/services/test-scenario.service.ts`, `useTestScenarioActions`) → gateway (`gateway/src/features/test-scenario/test-scenario.controller.ts`, `packages/entities/test-scenario`) → RMQ `testscenario.*` → `third/src/features/test-scenario/{test-scenario.rpc.controller,test-scenario.service,...}.ts`.
- Phương pháp: sub agent `flow-review-test-scenario`, **chỉ đọc, chưa chạy test**. Ngày 2026-10-17.
- Verdict: **OK** (0 Critical, 0 Major, 1 Minor). Tổng hợp chung: `auth-report.md` mục 5.

## Bảng luồng
Tất cả pattern route về `third_queue` qua `testscenario: THIRD_SERVICE` (`rmq.constants.ts:32`).

| UI hook | HTTP | RMQ | Khớp? |
|---|---|---|---|
| `routes` | GET /test-scenarios/routes | không qua RMQ (`listHttpRoutes`) | OK |
| `generate` | POST /test-scenarios/generate | `testscenario.generate` | OK |
| `bulkCreate` | POST /test-scenarios/bulk | `testscenario.createMany` | OK |
| `authProfiles` | GET /test-scenarios/auth-profiles | `testscenario.authprofiles` | OK |
| `fixtures` | GET /test-scenarios/fixtures | `testscenario.fixtures.list` | OK |
| `createFixture` | POST /test-scenarios/fixtures | `testscenario.fixtures.create` | OK |
| `updateFixture` | PATCH /test-scenarios/fixtures/:id | `testscenario.fixtures.update` | OK |
| `deleteFixture` | DELETE /test-scenarios/fixtures/:id | `testscenario.fixtures.delete` | OK |
| `resolveFixture` | POST /test-scenarios/fixtures/:id/resolve | `testscenario.fixtures.resolve` | OK |
| `create` | POST /test-scenarios | `testscenario.create` | OK |
| `list` | GET /test-scenarios | `testscenario.list` | OK |
| `meta` | GET /test-scenarios/meta | không qua RMQ (đọc env) | OK |
| `stats` | GET /test-scenarios/stats | `testscenario.stats` | OK |
| `runs` | GET /test-scenarios/:id/runs | `testscenario.runs` | OK |
| `update` | PATCH /test-scenarios/:id | `testscenario.update` | OK |
| `delete` | DELETE /test-scenarios/:id | `testscenario.delete` | OK |
| `run` / `runRealtime` | POST /test-scenarios/:id/run[?async=true] | `testscenario.run` | OK |

Mọi chuỗi pattern khớp 1-1, không mồ côi.

## Critical
Không còn bug mở.

## Major
Không còn bug mở.

## Minor

| ID | Mức | Nội dung |
|---|---|---|
| — | Minor | `resolveFixture` và `run` gửi `accessToken` qua RMQ (`gateway/.../test-scenario.controller.ts`, `third/.../test-scenario.rpc.controller.ts:85-91`); chưa xác nhận `RmqProducer` không log payload RMQ. |

## Sạch
Thứ tự route không bị che; cả controller `@UseGuards(RolesGuard)` + `@Roles('ADMIN')`; `.partial()` gỡ default đúng; schema gateway và third giống nhau; `userId` từ `@CurrentUser()` gửi cho `run` (lưu `triggeredBy`); `run`, `generate` timeout 120s `maxRetries 0`; `runs` limit 1–100; fixtures resolve có timeout riêng; PATCH fixture rỗng bị 422; lỗi dùng `ERROR_MESSAGES.TEST_SCENARIO_NOT_FOUND`; UI↔GW khớp (path, method, payload).

## Chưa xác minh
Shape thật `lastRun`/`flow` của `GET /test-scenarios` (repository.ts) và `routePath`/`exists` trong kết quả `generate`; `unwrapApiData`/`api-error.ts`; `JwtAuthGuard` toàn cục chạy trước `RolesGuard`; `RmqProducer` có log payload. Hai bản schema (gateway, third) có thể lệch nhau về sau vì không có gì ép đồng bộ.
