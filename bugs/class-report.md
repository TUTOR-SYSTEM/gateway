# Flow review: class

- Luồng: UI (`ui/lib/services/class.service.ts`) → gateway (`gateway/src/features/class/class.controller.ts`) → RMQ `class.*` → `tutor/src/features/class/{class.rpc.controller,class.service}.ts`.
- Phương pháp: sub agent `flow-review-class`, **chỉ đọc, chưa chạy test**. Ngày 2026-10-17.
- Verdict: **OK** (0 Critical, 0 Major, 1 Minor). Tổng hợp chung: `auth-report.md` mục 5.

## Bảng luồng
| UI | HTTP | RMQ | Khớp? |
|---|---|---|---|
| `create` | POST /classes (ADMIN, TUTOR) | `class.create` `{userId,data}` | Có |
| `update` | PUT /classes/:id | `class.update` | Có |
| `generateCode` | GET /classes/generate-code | `class.generateCode` → `{code}` | Có |
| `list` | GET /classes | `class.getAll` | Có |
| `detail` | GET /classes/:id | `class.getById` | Có |
| `enrollStudents` | POST /classes/:id/students | `class.addStudents` | Có |
| `students` | GET /classes/:id/students | `class.getStudents` | Có |
| `useGet` trực tiếp (`class-materials-page.tsx:74`, `class-detail-watch-page.tsx:314`) | GET /classes/:id/materials | `class.getMaterials` | Có |
| `class-detail-watch-page.tsx:288` | GET /classes/:id/watches | `class.getWatch` | Có |
| `delete` | DELETE /classes/:id | `class.delete` | Có |

10/10 pattern có đúng 1 handler, không mồ côi. `class` → `tutor_queue` (`rmq.constants.ts:40`).

## Critical
Không còn bug mở.

## Major
Không còn bug mở.

## Minor

| ID | Mức | Nội dung |
|---|---|---|
| — | Minor | `tutor/src/features/class/class.controller.ts` HTTP trùng lặp, không có `RolesGuard` ở create/update/delete (service tự chặn). Thuộc repo `tutor`; tutor có mở HTTP (`main.ts:112`). Cần quyết định hạ tầng: có expose port HTTP của tutor hay không. |

## Sạch
Payload khớp 10/10 pattern; read endpoint qua `loadAccessibleClass` (404 thay vì 403); roster/detail ẩn email/phone với người không phải chủ lớp; ADMIN bypass ownership ở service; update schema không dính `.default()`.

## Chưa xác minh
`class.dto.ts`/`class.schema.ts` tutor vs gateway có đồng bộ; shape `ClassDetailDto` vs `repo.getClass`; payload UI create/update thật (`Record<string, unknown>`); `unwrapApiData`/`api-error.ts`.
