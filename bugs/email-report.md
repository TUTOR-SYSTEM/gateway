# Flow review: email

- Luồng: UI (không có hàm trong `ui/lib/services`; chỉ `ui/components/flow-requests/flow-request-seed-data.ts:136` là công cụ test) → gateway (`gateway/src/features/email/email.controller.ts`) → RMQ `email.*` → `third/src/features/email/{email.rpc.controller,email.service}.ts`.
- Phương pháp: sub agent `flow-review-email`, **chỉ đọc, chưa chạy test**. Ngày 2026-10-17.
- Verdict: **OK** (0 Critical, 0 Major, 3 Minor). Tổng hợp chung: `auth-report.md` mục 5.

## Bảng luồng
| Nguồn | HTTP | RMQ | Handler | Khớp? |
|---|---|---|---|---|
| UI (chỉ seed data test) | GET /emails (ADMIN) `email.controller.ts:24` | `email.test` `{}` | `email.rpc.controller.ts:27` → `testSendEmailService` | Có |
| `user/src/features/auth/auth.service.ts:251` (user → third, không qua HTTP) | không có | `email.sendForgotPasswordMail` `{to, resetToken, displayName}` | `email.rpc.controller.ts:32` | Có |

`email` → `THIRD_SERVICE` (`rmq.constants.ts:28`), queue `third_queue` (`:12`). Mỗi pattern có đúng 1 `@MessagePattern`. `third/src/features/email/email.controller.ts` là HTTP controller trùng route `GET /emails`, không có đường nào dẫn tới từ client.

## Critical
Không còn bug mở.

## Major
Không còn bug mở.

## Minor

| ID | Mức | Nội dung |
|---|---|---|
| — | Minor | `GET /emails` chưa có `maxRetries: 0` (`email.controller.ts:25`, `rmq.constants.ts`); khi timeout RMQ có thể gửi lại mail thật trùng. |
| — | Minor | `GET` có tác dụng phụ: gửi mail thật qua Resend; gọi lặp tốn quota/spam. Gợi ý `POST /emails/test`. Chưa xác minh throttle. |
| — | Minor | `gateway/API_ENDPOINTS.md:559` (và các `API_ENDPOINTS.md` khác) ghi `GET /emails` là "Public", thực tế gateway yêu cầu `@Roles('ADMIN')`. Code đúng, sửa tài liệu. |

## Sạch
Không còn route `email.sendForgotPasswordMail` bị lộ qua gateway; payload forgot-password validate bằng Zod ở third (`email.rpc.controller.ts:12-16`); `displayName` được `escapeHtml` trước khi chèn HTML; `email.test` có `timeoutMs`.

## Chưa xác minh
Hook/component UI nào gọi `GET /emails` ngoài trang flow-requests; throttle/rate limit; `RolesGuard` đọc `req.user` do `JwtAuthGuard` gắn.
