# Flow review: chapter

- Luồng: UI (`ui/lib/services/chapter.service.ts`, `ui/types/chapter.types.ts`) → gateway (`gateway/src/features/chapter/chapter.controller.ts`, schema ở `packages/entities/curriculum/curriculum.schema.ts`) → RMQ `chapter.*` → `tutor/src/features/chapter/{chapter.rpc.controller,chapter.service}.ts`.
- Phương pháp: sub agent `flow-review-chapter`, **chỉ đọc, chưa chạy test**. Ngày 2026-10-17.
- Verdict: **OK** (0 Critical, 0 Major, 3 Minor). Tổng hợp chung: `auth-report.md` mục 5.

## Bảng luồng
| UI | HTTP | RMQ | Khớp? |
|---|---|---|---|
| `create` (hook) hoặc axios trực tiếp (`create-chapter-dialog.tsx:37`) | POST /chapter/:curriculumId (ADMIN, TUTOR) | `chapter.create` | Có |
| `list` | GET /chapter?curriculumId&page&limit | `chapter.getAll` | Có |
| `detail` | GET /chapter/:id | `chapter.getById` | Có |
| `update` | PUT /chapter/:id | `chapter.update` | Có |
| `delete` | DELETE /chapter/:id | `chapter.delete` | Có |

`chapter` → `TUTOR_SERVICE` (`rmq.constants.ts:36`).

## Critical
Không còn bug mở.

## Major
Không còn bug mở.

## Minor

| ID | Mức | Nội dung |
|---|---|---|
| — | Minor | Route `@Controller('chapter')` số ít, lệch quy ước plural (`chapter.controller.ts:32`); UI đang dùng `/chapter` nhiều chỗ nên cần phối hợp khi đổi. |
| — | Minor | `@ApiBody` create chỉ ghi `required: ['title']` (`chapter.controller.ts:54`). |
| — | Minor | Tham số `_curriculumId/_data/_query` đặt tiền tố `_` dù đang dùng (`chapter.controller.ts:58-80`). |

## Sạch
`userId` có trong create/update/delete; `updateChapterSchema` redeclare `order` không default; query dùng `z.coerce`; ghi bị giới hạn chủ curriculum qua `assertCurriculumOwner`; ADMIN được bypass; đọc chapter theo catalog chung (quyết định thiết kế); không dùng raw `ClientProxy`.

## Chưa xác minh
`chapter.module.ts` gateway; `ui/API_ENDPOINTS.md`.
