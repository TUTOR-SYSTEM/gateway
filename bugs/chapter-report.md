# Flow review: chapter

- Luồng: UI (`ui/lib/services/chapter.service.ts`, `ui/types/chapter.types.ts`) → gateway (`gateway/src/features/chapter/chapter.controller.ts`, schema ở `packages/entities/curriculum/curriculum.schema.ts`) → RMQ `chapter.*` → `tutor/src/features/chapter/{chapter.rpc.controller,chapter.service}.ts`.
- Phương pháp: sub agent `flow-review-chapter`, **chỉ đọc, chưa chạy test**. Ngày 2026-10-17.
- Verdict: **OK** (0 Critical, 0 Major, 0 Minor). Tổng hợp chung: `auth-report.md` mục 5.

## Bảng luồng
| UI | HTTP | RMQ | Khớp? |
|---|---|---|---|
| `create` (hook) hoặc axios trực tiếp (`create-chapter-dialog.tsx:37`) | POST /chapters/:curriculumId (ADMIN, TUTOR) | `chapter.create` | Có |
| `list` | GET /chapters?curriculumId&page&limit | `chapter.getAll` | Có |
| `detail` | GET /chapters/:id | `chapter.getById` | Có |
| `update` | PUT /chapters/:id | `chapter.update` | Có |
| `delete` | DELETE /chapters/:id | `chapter.delete` | Có |

`chapter` → `TUTOR_SERVICE` (`rmq.constants.ts:36`).

## Critical
Không còn bug mở.

## Major
Không còn bug mở.

## Minor

Không còn bug mở.

## Sạch
`userId` có trong create/update/delete; `updateChapterSchema` redeclare `order` không default; query dùng `z.coerce`; ghi bị giới hạn chủ curriculum qua `assertCurriculumOwner`; ADMIN được bypass; đọc chapter theo catalog chung (quyết định thiết kế); không dùng raw `ClientProxy`.

## Chưa xác minh
`chapter.module.ts` gateway; `ui/API_ENDPOINTS.md`.
