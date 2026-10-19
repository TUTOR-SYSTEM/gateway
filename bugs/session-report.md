# Flow review: session

- Luồng: UI (`ui/lib/services/session.service.ts`, `ui/types/session.types.ts`) → gateway (`gateway/src/features/session/session.controller.ts`, `packages/entities/session/session.schema.ts`) → RMQ `session.*` → `tutor/src/features/session/{session.rpc.controller,session.service}.ts`.
- Phương pháp: sub agent `flow-review-session`, **chỉ đọc, chưa chạy test**. Ngày 2026-10-17.
- Verdict: **OK** (0 Critical, 0 Major, 1 Minor). Tổng hợp chung: `auth-report.md` mục 5.

## Bảng luồng
| UI | HTTP | RMQ | Khớp? |
|---|---|---|---|
| `create` | POST /sessions (ADMIN, TUTOR) | `session.create` | Có |
| `createBulk` | POST /sessions/bulk | `session.createBulk` | Có |
| `list` | GET /sessions | `session.getAll` | Có (UI không gửi `startDate/endDate`) |
| `byClass` | GET /sessions/class/:classId | `session.getByClass` | Có |
| `detail` | GET /sessions/:id | `session.getById` | Có |
| `update` | PUT /sessions/:id | `session.update` | Có |
| `delete` | DELETE /sessions/:id | `session.delete` | Có |

7/7 pattern khớp. `session` → `TUTOR_SERVICE` (`rmq.constants.ts:42`).

## Critical
Không còn bug mở.

## Major
Không còn bug mở.

## Minor

| ID | Mức | Nội dung |
|---|---|---|
| — | Minor | `GET /sessions/class/:classId` chỉ cho tutor sở hữu (`assertClassOwner`), `getById` cho cả student/parent; student gọi `byClass` sẽ lỗi, phải dùng `GET /sessions`. Có thể là thiết kế (`session.service.ts:137-143`). |

## Sạch
Ownership qua `assertClassOwner`, `loadOwnedSession`, `isEnrolled`, `isParentOfEnrolled` và trả 404 khi không quyền (không lộ IDOR); `endAt > startAt` và `:id`/`:classId` đã validate; update schema không dính `.default()` qua `.partial()`; payload `{userId, data|query|id|classId}` khớp.

## Chưa xác minh
Output repo (`getAll`, `getDetailById`) có khớp `StudentSessionListItem/Detail`; UNIQUE DB và hành vi `repo.createMany`; `lib/axios/api-error.ts`.
