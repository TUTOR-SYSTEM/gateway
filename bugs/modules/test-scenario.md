# Bug review — module `test-scenario`

Ngày: 2026-10-16
Phạm vi: `src/features/test-scenario/` + entity `src/packages/entities/test-scenario/` + `RmqProducer`/`rmq.constants.ts` + `RolesGuard`/`listHttpRoutes`.
Không build/test, chỉ đọc tĩnh.

| Mức | Số lượng |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 2 |
| Low | 4 |

## Bug

| ID | Mức | File:dòng | Vấn đề | Kịch bản lỗi | Hướng sửa |
|---|---|---|---|---|---|
| TSC-01 | Medium | `src/features/test-scenario/test-scenario.controller.ts:302-315`; `src/packages/entities/test-scenario/test-scenario.schema.ts:24-27` | Scenario có thể trỏ `path` về chính endpoint `/test-scenarios/...` (ví dụ `POST /test-scenarios/<id>/run`). Schema chỉ kiểm tra `/` đầu, không chặn prefix `/test-scenarios`; handler `run` không có guard đệ quy. | Admin tạo scenario `POST /test-scenarios/<id>/run`, chạy với `wait: true` (timeout 120s, `maxRetries: 0`). Mỗi lần chạy gọi lại gateway, gateway gửi `testscenario.run` tiếp. Chuỗi lồng nhau giữ connection tới 120s mỗi tầng, có thể tự DoS. | Từ chối trong schema (`createTestScenarioSchema`, `updateTestScenarioSchema`, `bulkCreateTestScenariosSchema`) các path bắt đầu bằng `/test-scenarios`. Hoặc thêm header depth trong `run`. Cần xác minh thêm phía third-service có chặn self-run không. |
| TSC-02 | Medium | `src/packages/entities/test-scenario/test-scenario.schema.ts:79-80`; `src/features/test-scenario/test-scenario.controller.ts:158-164` | Invariant "fixture cần `value` hoặc `resolver`" chỉ có ở `createTestFixtureSchema` (`.refine`). `updateTestFixtureSchema` là `z.object(fixtureFields).partial()` không có refine nên không kiểm tra. | `PATCH /test-scenarios/fixtures/:id` với `{"value": null, "resolver": null}` qua được gateway. Fixture rỗng được lưu, và `{{fixture.<key>}}` sẽ không resolve được. Gateway không biết trạng thái cũ nên không tự kiểm tra được. | Thêm kiểm tra invariant ở owner service sau khi merge với bản ghi hiện tại. Gateway chỉ bổ sung được phần kiểm tra cho body đơn lẻ. Cần xác minh owner (third-service) có kiểm tra lại không. |
| TSC-03 | Low | `src/features/test-scenario/test-scenario.controller.ts:253-257` | Doc ghi `limit` "1–100, default 20" nhưng `ParseIntPipe` không giới hạn khoảng. Các giá trị `0`, `-5`, `1000000` đi xuống downstream nguyên vẹn. | `GET /test-scenarios/:id/runs?limit=1000000` được forward xuống `testscenario.runs`. Nếu owner không clamp thì query nặng. | Dùng Zod schema cho query, ví dụ `z.coerce.number().int().min(1).max(100).default(20)` theo `conventions.md`, thay vì `DefaultValuePipe` + `ParseIntPipe`. |
| TSC-04 | Low | `src/packages/entities/test-scenario/test-scenario.schema.ts:59,64,80` | `fixtureResolverSchema` có `.default('GET')` và `.default('admin')`. `updateTestFixtureSchema` kế thừa chúng qua `.partial()`. Điều này đi ngược quy tắc "update schema không được kế thừa `.default`" trong `nestjs-feature-pattern.md`, và khác với `updateTestScenarioSchema` (dòng 39-47) vốn đã tránh việc này. | `PATCH` fixture chỉ gửi `resolver: { path, extract }` (không có `authProfile`) sẽ đặt `authProfile` về `admin`. Nếu owner merge resolver thì mất giá trị cũ. Nếu owner thay thế nguyên resolver thì đây chỉ là khác biệt so với hành vi mong muốn. | Tách `fixtureResolverUpdateSchema` không có default và dùng cho `updateTestFixtureSchema`. |
| TSC-05 | Low | `src/features/test-scenario/test-scenario.controller.ts:294-300,313` | Swagger khai báo `async` là `type: Boolean`, nhưng handler so sánh chuỗi `asyncMode !== 'true'`. Với `?async=1` hoặc `?async=TRUE` thì `wait` = true (chạy đồng bộ), trong khi tài liệu chỉ nói `true`. | Client theo Swagger gửi `async=1` và nhận kết quả sync sau tối đa 120s thay vì `{ correlationId }` ngay. | Parse rõ bằng Zod (`z.enum(['true','false'])` hoặc `z.stringbool()`) và khớp với `@ApiQuery`. |
| TSC-06 | Low | `src/features/test-scenario/test-scenario.controller.ts:209-213` | Danh sách `enum` của `category` được viết tay trong `@ApiQuery`, trùng với `testScenarioCategorySchema` (`schema.ts:3-9`). Khi thêm category mới dễ lệch. | Thêm category mới vào schema nhưng Swagger không cập nhật, client không thấy giá trị mới. | Dùng `enum: testScenarioCategorySchema.options` trong `@ApiQuery`. |

## Phụ thuộc cần repo khác (nếu có)
- Gateway chỉ forward. Các pattern `testscenario.*` phải có `@MessagePattern` tương ứng trong third-service, gồm: `generate`, `createMany`, `authprofiles`, `fixtures.list|create|update|delete|resolve`, `create`, `list`, `stats`, `runs`, `update`, `delete`, `run`. Đây là contract; gateway không kiểm tra được lúc compile. Payload gateway gửi: `generate` là `{routes, listRoutes, categories}`; `createMany` là `dto` (`{scenarios}`); `fixtures.update` và `update` là `{id, dto}`; `delete`, `fixtures.delete` và `fixtures.resolve` (kèm `accessToken`) là `{id}`/`{id, accessToken}`; `run` là `{id, userId, accessToken, wait}`; `runs` là `{id, limit}`.
- `testscenario.run` và `testscenario.fixtures.resolve` nhận admin bearer token thô qua RMQ (`controller.ts:188-189, 308-313`). Third-service không được lưu token này vào bảng run/log. Endpoint `runs` phải trả body đã redact. Cần xác minh ở owner.
- `generate` forward nguyên `RouteInfo` gồm cờ `oauth` và `multipart` (`route-catalog.helper.ts`). Gateway không lọc các route này; downstream phải bỏ qua chúng.
- `createFixture` khai báo 409 "Key already exists" trong Swagger (`controller.ts:145`). Owner phải trả đúng 409 thì Swagger mới khớp.
- Nếu owner clamp `limit` thì TSC-03 không gây tác động thực tế.
- `isIdempotentPattern` (`rmq.constants.ts`) so khớp regex theo prefix, không anchor cuối. Với các pattern của module này: `testscenario.run` không bị coi là idempotent (chỉ `runs` khớp), và `run` đã có `maxRetries: 0`. Không phát hiện vấn đề riêng cho module này.

## Đã đọc
- `.claude/agents/gw-module-reviewer.md`
- `CLAUDE.md` (phần liên quan tới test-scenario, RMQ, validation)
- `.claude/rules/nestjs-feature-pattern.md`
- `.claude/rules/conventions.md`
- `src/features/test-scenario/test-scenario.controller.ts`
- `src/features/test-scenario/test-scenario.module.ts`
- `src/packages/entities/test-scenario/test-scenario.schema.ts`
- `src/packages/entities/test-scenario/test-scenario.dto.ts` (đọc qua `cat`)
- `src/features/rabbitmq/rmq.producer.ts` (phần `send`, phân loại lỗi và retry)
- `src/features/rabbitmq/rmq.constants.ts`
- `src/packages/guards/roles.guard.ts`
- `src/packages/helpers/route-catalog.helper.ts` (đọc một phần, output bị nén)
- `src/app.module.ts` (chỉ dòng 27 và 61 để xác nhận đăng ký module, không chạy-prod)
