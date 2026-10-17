# Flow review: attendance

- Luồng: UI (`ui/lib/services/attendance.service.ts`) → gateway (`gateway/src/features/attendance/attendance.controller.ts`, `packages/entities/attendance`) → RMQ `attendance.*` → `tutor/src/features/attendance/{attendance.rpc.controller,attendance.service}.ts`.
- Phương pháp: sub agent `flow-review-attendance`, **chỉ đọc, chưa chạy test**. Ngày 2026-10-17.
- Verdict: **OK** (0 Critical, 0 Major, 1 Minor). Tổng hợp chung: `auth-report.md` mục 5.

## Bảng luồng
| UI | HTTP | RMQ | Khớp? |
|---|---|---|---|
| `list` | GET /attendances/session/:sessionId | `attendance.getBySession` `{userId, sessionId}` | Có |
| `upsert` | PUT /attendances (ADMIN, TUTOR) | `attendance.upsert` `{userId, data}` | Có |

2/2 pattern khớp. `attendance` → `TUTOR_SERVICE` (`rmq.constants.ts:43`).

## Critical
Không còn bug mở.

## Major
Không còn bug mở.

## Minor

| ID | Mức | Nội dung |
|---|---|---|
| — | Minor | Schema dùng `z.string().uuid({ message })` (deprecated trong Zod v4, nên `z.uuid()`) (`gateway/src/packages/entities/attendance/attendance.schema.ts:6,9`). |

## Sạch
Ownership: `getBySessionService` qua `sessionService.getSessionService`; upsert kiểm tra roster, student ngoài lớp 404; ADMIN được bypass ownership; upsert dùng `onConflictDoUpdate` trên `(sessionId, studentId)`; schema upsert `{sessionId, studentId, present, note ≤ 500}` khớp UI.

## Chưa xác minh
`attendance.dto.ts` gateway; `attendance.repository.ts` (chỉ grep dòng upsert); `tutor/attendance.controller.ts` HTTP có phơi route ngoài gateway.
