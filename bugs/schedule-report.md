# Flow review: schedule

- Luồng: UI (`ui/lib/services/schedule.service.ts`, `ui/types/schedule.types.ts`) → gateway (`gateway/src/features/schedule/schedule.controller.ts`, `packages/entities/schedule`) → RMQ `schedule.*` → `tutor/src/features/schedule/{schedule.rpc.controller,schedule.service}.ts`.
- Phương pháp: sub agent `flow-review-schedule`, **chỉ đọc, chưa chạy test**. Ngày 2026-10-17.
- Verdict: **OK** (0 Critical, 0 Major, 2 Minor). Tổng hợp chung: `auth-report.md` mục 5.

## Bảng luồng
| UI | HTTP | RMQ | Khớp? |
|---|---|---|---|
| `create` | POST /schedules (ADMIN, TUTOR) | `schedule.create` | Có |
| `createBulk` | POST /schedules/bulk | `schedule.createBulk` | Có |
| `list` | GET /schedules | `schedule.getAll` | Có |
| `byClass` | GET /schedules/class/:classId | `schedule.getByClass` | Có |
| `detail` | GET /schedules/:id | `schedule.getById` | Có |
| `update` | PATCH /schedules/:id | `schedule.update` | Có |
| `delete` | DELETE /schedules/:id | `schedule.delete` | Có |

7/7 pattern khớp 1-1. `schedule` → `TUTOR_SERVICE` (`rmq.constants.ts:41`).

## Critical
Không còn bug mở.

## Major
Không còn bug mở.

## Minor

| ID | Mức | Nội dung |
|---|---|---|
| — | Minor | `UpdateScheduleDto = Partial<z.infer<typeof createScheduleSchema>>` (`tutor/src/packages/entities/schedule/schedule.dto.ts:7`) không khớp `updateScheduleSchema` (đã omit `classId`). |
| — | Minor | Không kiểm tra trùng slot ở bulk; update một nửa `startTime`/`endTime` không đối chiếu giá trị đã lưu. |

## Sạch
`userId` từ `@CurrentUser()` cho mọi route; ADMIN được bypass ownership; `updateScheduleSchema` redeclare `format` nên `.partial()` không kéo `.default('ONLINE')`; `startTime < endTime` được kiểm tra; `:id`/`:classId` qua `ParseUUIDPipe`; UI unwrap `data.schedules` đúng.

## Chưa xác minh
Component UI nào dùng `list/byClass/detail/update/delete` (chỉ thấy `createBulk` ở `create-class-modal.tsx:161`); body `usePatch` có kèm `id`; rate limit và thứ tự guard.
