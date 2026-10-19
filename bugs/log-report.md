# Flow review: log

- Luồng: UI (`ui/lib/services/log.service.ts`, `ui/types/log.types.ts`) → gateway (`gateway/src/features/log/log.controller.ts`) → RMQ `log.*` → `third/src/features/log/{log.rpc.controller,log.service,log.repository,log.gateway}.ts`.
- Phương pháp: sub agent `flow-review-log`, **chỉ đọc, chưa chạy test**. Ngày 2026-10-17.
- Verdict: **OK** (0 Critical, 0 Major, 1 Minor). Tổng hợp chung: `auth-report.md` mục 5.

## Bảng luồng
| UI | HTTP | RMQ | Khớp? |
|---|---|---|---|
| `list` (service.ts:46) | GET /logs | `log.query` | Có |
| `trace` (:57) | GET /logs/trace/:correlationId | `log.trace` | Có |
| `stats` (:67) | GET /logs/stats | `log.stats` | Có |
| (gateway `main.ts:42`, các service qua `setLogSink`) | không có | `log.create` (emit, `@EventPattern`) | Có (ghi log nội bộ) |
| UI socket `/logs`, event `log:new` | WS | không có | `LogGateway` (không xác minh phía UI) |

`log` → `THIRD_SERVICE` (`rmq.constants.ts:31`). 3 pattern gateway gửi có đúng 1 handler; `log.create` không có call-site `send` ở gateway (đúng ý đồ).

## Critical
Không còn bug mở.

## Major
Không còn bug mở.

## Minor

| ID | Mức | Nội dung |
|---|---|---|
| — | Minor | Dữ liệu trả gồm `requestBody/responseBody`/headers có thể chứa secret (`ui/types/log.types.ts:27-31`); chưa xác nhận redaction (`SENSITIVE_KEYS`) trước khi emit `log.create`. |

## Sạch
Payload khớp (`query` nguyên DTO đã parse, `trace` `{correlationId}`, `stats` `{}`); `correlationId` có Zod ở service và rpc; service parse lại bằng cùng schema (`safeParse` → `BadRequestException`); `getRequestLogsQuerySchema` dùng `z.coerce.number()`; toàn controller `@Roles('ADMIN')` + `RolesGuard`, không `@Public`; shape `{data, pagination{total,page,limit,totalPages}}` và `EndpointStats` khớp UI; thứ tự route `stats` / `trace/:id` không xung đột.

## Chưa xác minh
Schema `@packages/entities/log` bên third (bản sao riêng); cột `requestHeaders/responseHeaders/host` trong DB; client WS phía UI; cơ chế redaction của `LoggerInterceptor`, `log-sink.ts`, `TraceContextInterceptor`; `stats` dùng `percentile_cont` trên 24h dữ liệu có thể chậm khi bảng lớn (timeout mặc định 10s).
