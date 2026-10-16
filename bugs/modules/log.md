# Bug review — module `log`

Ngày: 2026-10-16
Phạm vi: `src/features/log/` + entity `src/packages/entities/log/` + `src/features/rabbitmq/` (route/retry) + `RolesGuard`/`ZodValidationPipe`. Owner: `THIRD_SERVICE/src/features/log/`.
Không build/test, chỉ đọc tĩnh.

| Mức | Số lượng |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 6 |

## Bug

| ID | Mức | File:dòng | Vấn đề | Kịch bản lỗi | Hướng sửa |
|---|---|---|---|---|---|
| LOG-01 | Low | `src/features/rabbitmq/rmq.constants.ts:92` | `isIdempotentPattern` chỉ nhận `get/find/list/history/stats/...`. `log.query` (method `query`) và `log.trace` (method `trace`) không khớp nên bị coi là ghi: `rmq.producer.ts:172` đặt `unsafeToRetryTimeout = true`, chỉ 1 lần gọi, không retry khi timeout. | Đọc log bị chậm tạm thời (THIRD bận) → gateway trả 504 ngay ở lần thử đầu, dù đây là thao tác đọc an toàn để retry. | Thêm `query|trace` vào regex (hoặc tách danh sách read-only riêng). Chưa xác minh thực tế tần suất timeout. |
| LOG-02 | Low | `src/features/log/log.controller.ts:32-37`, `src/packages/entities/log/log.schema.ts:6-11` | Swagger lệch schema: `@ApiQuery` không ghi `min 1` của `page`, `max 100` của `limit`, `default` 1/20; `serviceName`, `correlationId`, `search` khai báo string tự do nhưng schema không giới hạn độ dài. `serviceName` không có enum dù DB là `varchar(50)`. | Client đọc Swagger gửi `limit=500` → 422 mà doc không báo. Không gây lỗi runtime trực tiếp. | Thêm `minimum/maximum/default` vào `@ApiQuery` (hoặc `@ApiProperty` của DTO), đồng bộ với `log.schema.ts`. |
| LOG-03 | Low | `src/packages/entities/log/log.schema.ts:10-11`, `src/features/log/log.controller.ts:54-55` | Không giới hạn độ dài `serviceName`, `correlationId`, `search` (`z.string()` không `.max()`). Param `:correlationId` trên `trace/` không qua pipe/schema nào. Chuỗi rất dài đi thẳng xuống `ILIKE` và `eq()` ở THIRD. | Admin (hoặc request bị lộ token admin) gửi `search` hàng chục KB → query `ILIKE '%...%'` nặng trên `request_logs`. Chưa đo được mức ảnh hưởng. | Thêm `.max(100)` / `.max(200)` cho từng field và schema cho param `correlationId` (ví dụ `z.string().min(1).max(100)`). |
| LOG-04 | Low | `THIRD_SERVICE/src/features/log/log.repository.ts:50` (owner) | `search` được nhúng trực tiếp vào `ilike(path, '%'+search+'%')` mà không escape `%` và `_`. Gateway không escape ở `log.schema.ts:11`. | Admin tìm `/api/_users` → `_` khớp mọi ký tự, trả về path không liên quan. Sai kết quả lọc, không phải injection (drizzle parameterized). | Escape `\`, `%`, `_` trước khi build pattern, dùng `ilike(..., ESCAPE '\\')`. Kiểm tra bên `THIRD_SERVICE`, không sửa ở gateway. |
| LOG-05 | Low | `THIRD_SERVICE/src/features/log/log.repository.ts:61` và `:76-82` (owner) | `findAll` chỉ `orderBy(desc(createdAt))`, không có tiebreak theo `id`: các dòng cùng `createdAt` có thể đổi thứ tự giữa các trang (phân trang không ổn định). `findByCorrelationId` không có `limit`: trả về toàn bộ dòng của một correlationId. | Hai dòng cùng timestamp có thể xuất hiện ở 2 trang hoặc bị bỏ sót khi admin lật trang. Một correlationId lớn trả về mảng không giới hạn qua `GET /logs/trace/:correlationId`. | Thêm `desc(requestLogs.id)` làm tiebreak; thêm `limit` (ví dụ 500) cho `findByCorrelationId`. Kiểm tra bên `THIRD_SERVICE`. |
| LOG-06 | Low | `src/features/log/log.controller.ts:43, 55` (trả về) — redaction ở `LoggerInterceptor` (chưa đọc) | `GET /logs`, `GET /logs/trace/:id` trả về nguyên `requestBody`, `responseBody`, `ip`, `userId`. An toàn của dữ liệu phụ thuộc vào `SENSITIVE_KEYS` của `LoggerInterceptor` lúc ghi (chưa xác minh trong phạm vi này). | Nếu một route nhạy cảm mới có field tên khác với `SENSITIVE_KEYS` (ví dụ `otp`, `refreshTokenValue`), admin đọc được qua trang log. Hiện chỉ là rủi ro tiềm ẩn. | Xác minh `LoggerInterceptor` redaction (`src/packages/interceptor/`) và `SENSITIVE_KEYS` đủ cho các field nhạy cảm; cân nhắc bỏ `requestBody/responseBody` khỏi response list. |

## Phụ thuộc cần repo khác (nếu có)
- `THIRD_SERVICE/src/features/log/log.repository.ts` (`findAll`, `findByCorrelationId`) là nơi xử lý thực tế cho LOG-04 và LOG-05. Đã đọc, nhưng chưa xác minh hành vi thực tế trên DB.
- `THIRD_SERVICE/src/features/log/log.rpc.controller.ts`: pattern `log.query`, `log.trace`, `log.stats` khớp với gateway (đã đối chiếu, không có lệch tên).
- `THIRD_SERVICE/src/features/log/log.gateway.ts` (WebSocket `/logs`) không thuộc phạm vi gateway, chưa đọc.

## Đã đọc
- `src/features/log/log.controller.ts`
- `src/features/log/log.module.ts`
- `src/packages/entities/log/log.schema.ts`
- `src/packages/entities/log/log.dto.ts`
- `src/packages/entities/log/index.ts`
- `src/features/rabbitmq/rmq.constants.ts`
- `src/features/rabbitmq/rmq.producer.ts`
- `src/packages/guards/roles.guard.ts`
- `src/packages/pipes/zod-validation.pipe.ts`
- `src/app.module.ts` (đăng ký `LogModule` ở dòng 26 và 59)
- `src/database/schema.ts` (`requestLogs`, dòng ~463-491)
- `src/main.ts` (grep `addBearerAuth` / `access-token`: khớp với `@ApiBearerAuth('access-token')`)
- `THIRD_SERVICE/src/features/log/log.rpc.controller.ts`
- `THIRD_SERVICE/src/features/log/log.service.ts`
- `THIRD_SERVICE/src/features/log/log.repository.ts`
- `THIRD_SERVICE/CLAUDE.md`, `THIRD_SERVICE/.claude/rules/*.md` (phần liên quan)
