# Flow review: tuition

- Luồng: UI (`ui/lib/services/tuition.service.ts`, `ui/types/tuition.types.ts`) → gateway (`gateway/src/features/tuition/tuition.controller.ts`, `packages/entities/tuition/tuition.schema.ts`) → RMQ `tuition.*` → `tutor/src/features/tuition/{tuition.rpc.controller,tuition.service}.ts`.
- Phương pháp: sub agent `flow-review-tuition`, **chỉ đọc, chưa chạy test**. Ngày 2026-10-17.
- Verdict: **OK** (0 Critical, 0 Major, 1 Minor). Tổng hợp chung: `auth-report.md` mục 5.

## Bảng luồng
| UI | HTTP | RMQ | Khớp? |
|---|---|---|---|
| `create` | POST /tuitions (ADMIN, TUTOR) | `tuition.create` `{userId,data}` | Có |
| `summary` | GET /tuitions/summary | `tuition.getSummary` `{userId,classId}` | Có |
| `list` | GET /tuitions | `tuition.getAll` | Có |
| `detail` | GET /tuitions/:id | `tuition.getById` | Có |
| `update` | PUT /tuitions/:id (ADMIN, TUTOR) | `tuition.update` | Có |
| `delete` | DELETE /tuitions/:id (ADMIN, TUTOR) | `tuition.delete` | Có |

6/6 pattern khớp. `tuition` → `TUTOR_SERVICE` (`rmq.constants.ts:39`).

## Critical
Không còn bug mở.

## Major
Không còn bug mở.

## Minor

| ID | Mức | Nội dung |
|---|---|---|
| — | Minor | `tutor/src/features/tuition/tuition.controller.ts` HTTP trùng route `tuitions`; chưa xác minh được mount. |

## Sạch
ADMIN được bypass ownership ở service; `updateTuitionSchema` redeclare `status` không `.default()` (đúng quy ước); không IDOR: `findAll`/`findById` giới hạn theo student của bản ghi hoặc tutor của lớp; `getSummary` giới hạn theo lớp sở hữu; query list và body khớp UI; `amount` trả string khớp type UI; `dueDate/paidDate` null đã khớp type UI.

## Chưa xác minh
`JwtGuardUser.id` là UUID; `RolesGuard` khi `@UseGuards` đặt trên method; xử lý lỗi UI (`api-error.ts`); component `tuitions-board`, `tuition-pay-dialog`, `tuition-detail-dialog`.
