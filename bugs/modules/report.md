# Bug review — module `report`

Ngày: 2026-10-16
Phạm vi: `src/features/report/` + entity/guard/RMQ liên quan. Không build/test, chỉ đọc tĩnh.

| Mức | Số lượng |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 3 |

## Bug

| ID | Mức | File:dòng | Vấn đề | Kịch bản lỗi | Hướng sửa |
|---|---|---|---|---|---|
| REP-01 | Low | `src/features/rabbitmq/rmq.constants.ts:89-95` | `isIdempotentPattern` không khớp `report.summary`, `report.attendanceTrend`, `report.classList` (chỉ đọc nhưng bị coi là ghi). | Khi tutor-service vượt timeout 10s, `RmqProducer.send` trả 504 ngay, không retry. Không gây trùng dữ liệu. | Thêm `summary\|attendanceTrend\|classList` vào regex, hoặc policy timeout riêng cho `report.*`. |
| REP-02 | Low | `src/packages/entities/report/report.schema.ts:6` | `search: z.string().trim().min(1).optional()`: `?search=` rỗng bị 400 thay vì bỏ qua filter. Schema y hệt ở `tutor-service/src/packages/entities/report/report.schema.ts:6`. | Client gửi `search=` khi ô tìm kiếm trống nhận 400 ở `GET /reports/learning/classes`. Chưa xác minh client thực tế. | Đổi chuỗi rỗng thành `undefined` sau trim, sửa đồng bộ hai repo. |
| REP-03 | Low | `src/packages/entities/report/report.dto.ts:6-38` | Bốn type response không được gateway dùng và trùng với `tutor-service/src/packages/entities/report/report.dto.ts`; controller không có response schema Swagger. | Tutor đổi field response mà gateway không biết; chỉ lệch khi UI/Swagger không khớp. Rủi ro maintainability. | Xóa type không dùng, hoặc dùng làm `@ApiOkResponse` schema. |

## Đã kiểm tra, không phát hiện bug
- Phân quyền: `@UseGuards(RolesGuard)` + `@Roles('ADMIN')` ở class level cho cả 3 route; `JwtAuthGuard` global chạy trước.
- Routing: prefix `report` → `TUTOR_SERVICE`; ba pattern khớp `@MessagePattern` ở tutor-service.
- Payload: `{ userId }` và `{ query, userId }` khớp phía tutor.
- IDOR: tutor tự kiểm tra admin qua `assertAdminActor` (fail closed) bằng `userId` từ JWT.
- Input: query validate bằng Zod, khớp `@ApiQuery`.
- Đăng ký: `ReportModule` có trong `src/app.module.ts`.

## Đã đọc
- `src/features/report/report.controller.ts`, `report.module.ts`
- `src/packages/entities/report/index.ts`, `report.schema.ts`, `report.dto.ts`
- `src/packages/guards/roles.guard.ts`, `src/features/rabbitmq/rmq.constants.ts`, `rmq.producer.ts`, `src/app.module.ts`
- `tutor-service/src/features/report/report.rpc.controller.ts`, `report.service.ts` (đầu file), `tutor-service/src/packages/entities/report/*`
