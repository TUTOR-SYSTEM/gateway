# Bug review — module `email`

Ngày: 2026-10-16
Phạm vi: `src/features/email/` + `src/features/rabbitmq/rmq.producer.ts`, `rmq.constants.ts` (route/policy liên quan), `src/packages/guards/roles.guard.ts`.
Không build/test, chỉ đọc tĩnh. Chưa grep toàn repo (Bash tạm bị chặn), các tham chiếu `email` khác chỉ xác nhận qua `rmq.constants.ts` và `app.module.ts`.

| Mức | Số lượng |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 1 |
| Low | 3 |

## Bug

| ID | Mức | File:dòng | Vấn đề | Kịch bản lỗi | Hướng sửa |
|---|---|---|---|---|---|
| EMAIL-01 | Medium | `src/features/email/email.controller.ts:24-25`, `src/features/rabbitmq/rmq.producer.ts:172-174` | `GET /emails` gọi `email.test` (có side effect: gửi email thật) nhưng dùng retry mặc định 2 lần. `send()` chỉ chặn retry với lỗi business (có `statusCode`) hoặc timeout không idempotent; mọi lỗi khác (responder ném `Error` thường, mất kết nối sau khi đã gửi) đều bị retry. | Admin gọi `/emails`; third-service đã gửi mail nhưng trả lỗi không có `statusCode` (hoặc connection drop) → gateway retry 2 lần → admin nhận 3 email test, response vẫn báo lỗi. | Thêm `'email.test': { maxRetries: 0 }` vào `RMQ_SLOW_PATTERN_POLICIES` (`rmq.constants.ts`) hoặc truyền `maxRetries=0` tại controller. Lâu dài: producer chỉ retry khi chắc chắn chưa thực thi (pattern idempotent). |
| EMAIL-02 | Low | `src/features/email/email.controller.ts:20` | Hành động có side effect (gửi email) dùng `@Get()`. GET bị prefetch, link-checker, crawler, proxy cache có thể kích hoạt. | Trình duyệt/bot mở link `/emails` → gửi email test ngoài ý muốn. | Đổi sang `@Post()` (kèm `@HttpCode(StatusCodes.OK)` hoặc 201 theo quy ước), cập nhật Swagger và client. |
| EMAIL-03 | Low | `src/features/email/email.controller.ts:23` | `@SwaggerResponse` chỉ khai báo 200. Route có `@Roles('ADMIN')` nên có 401 (JWT thiếu/hết hạn) và 403 (`RolesGuard` ném `ForbiddenException`), nhưng không được document. | Swagger client không biết xử lý 403; lệch contract với hành vi thực. | Thêm `@SwaggerResponse({ status: 401 })` và `({ status: 403 })`, hoặc dùng decorator chung từ `@packages/decorators`. |
| EMAIL-04 | Low | `src/features/email/email.controller.ts:24-26` | Thiếu `requestId` và log `[SEND-START]/[SEND-SUCCESS]/[SEND-FAILED]` ở controller theo `conventions.md` ("RPC request tracking"). Hiện chỉ có log trong producer, không có `requestId` riêng để đối chiếu với log của third-service. | Khi test email lỗi trên production, khó tương quan request gateway với log third-service. | Bổ sung `requestId` theo mẫu trong `conventions.md`, hoặc ghi rõ ngoại lệ nếu route debug này không cần. |

## Ghi chú

- Phần còn lại của module đúng pattern: thin proxy, không service/repository, `RolesGuard` + `@Roles('ADMIN')`, pattern `email.test` có prefix `email` đã được route trong `RMQ_PREFIX_ROUTES` (→ `THIRD_SERVICE`). Không tìm thấy lỗi routing.
- Payload `{}` không cần Zod vì không có input từ client.
- Chưa kiểm tra handler `email.test` phía third-service (ngoài repo, không thuộc phạm vi).
