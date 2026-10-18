# Flow review: curriculum

- Luồng: UI (`ui/lib/services/curriculum.service.ts`, `ui/types/curriculum.types.ts`, `curriculum-form-dialog.tsx`) → gateway (`gateway/src/features/curriculum/curriculum.controller.ts`, `packages/entities/curriculum/curriculum.schema.ts`) → RMQ `curriculum.*` → `tutor/src/features/curriculum/{curriculum.rpc.controller,curriculum.service}.ts`.
- Phương pháp: sub agent `flow-review-curriculum`, **chỉ đọc, chưa chạy test**. Ngày 2026-10-17.
- Verdict: **OK** (0 Critical, 0 Major, 3 Minor). Tổng hợp chung: `auth-report.md` mục 5.

## Bảng luồng
| UI | HTTP | RMQ | Khớp? |
|---|---|---|---|
| `generateCode` (service.ts:60; dialog:154) | GET /curriculum/generate-code | `curriculum.generateCode` → `{code}` | Có |
| `create` (service.ts:69; dialog:172) | POST /curriculum | `curriculum.create` | Có |
| `list` | GET /curriculum | `curriculum.getAll` | Có |
| `detail` | GET /curriculum/:id | `curriculum.getById` | Có |
| `update` | PUT /curriculum/:id | `curriculum.update` | Có |
| `delete` | DELETE /curriculum/:id | `curriculum.delete` | Khớp tên và kiểu trả về (`boolean`, UI khớp) |

6/6 pattern khớp. `generate-code` khai báo trước `:id` nên không bị nuốt.

## Critical
Không còn bug mở.

## Major
Không còn bug mở.

## Minor

| ID | Mức | Nội dung |
|---|---|---|
| — | Minor | `generate-code` trả mã chưa lưu nên có thể trùng khi hai request đồng thời (`curriculum.generate-code`, không có ràng buộc unique tại thời điểm sinh). |
| — | Minor | `grade` gateway chuyển sang Number, repo update đổi lại String (`curriculum.repository.ts:164`). Chưa kiểm tra lại `create` repo. |
| — | Minor | Tham số `_dto/_id/_user/_query` đặt tiền tố `_` dù đang dùng (`curriculum.controller.ts`, `curriculum.rpc.controller.ts`). |

## Sạch
Ghi bị giới hạn chủ curriculum, ADMIN được bypass; `update` rpc dùng `UpdateCurriculumDto`; `generate-code` trả `{ code }` đúng shape UI; `curriculum.getById` không tìm thấy → 404; đọc curriculum là catalog chung (quyết định thiết kế).

## Chưa xác minh
`tutor/test/features/curriculum/curriculum.service.spec.ts`; shape `boolean` của delete; `ResponseInterceptor`, `api-error.ts`.
