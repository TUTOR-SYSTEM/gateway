# Flow review: notification

- Luồng: UI (`ui/lib/services/notification.service.ts`, `ui/types/notification.types.ts`) → gateway (`gateway/src/features/notification/notification.controller.ts`, `packages/entities/notification/notification.schema.ts`) → RMQ `notification.*` → `third/src/features/notification/{notification.rpc.controller,notification.service,notification.repository}.ts`.
- Phương pháp: sub agent `flow-review-notification`, **chỉ đọc, chưa chạy test**. Ngày 2026-10-17.
- Verdict: **OK** (0 Critical, 0 Major, 2 Minor). Tổng hợp chung: `auth-report.md` mục 5.

## Bảng luồng
| UI | HTTP | RMQ | Khớp? |
|---|---|---|---|
| `create` (service.ts:79) | POST /notifications (ADMIN, TUTOR) | `notification.create` `{...dto, senderId, role}` | Có |
| `list` (:58) | GET /notifications | `notification.getAll` `{userId, query}` | Có |
| `markAllRead` (:85) | PATCH /notifications/read-all | `notification.markAllAsRead` `{userId}` | Có |
| `detail` (:69) | GET /notifications/:id | `notification.getById` `{id,userId,role}` | Có |
| `markRead` (:82) | PATCH /notifications/:id/read | `notification.markAsRead` | Có |
| `del` (:88) | DELETE /notifications/:id | `notification.delete` | Có |

6/6 pattern khớp. `notification` → `THIRD_SERVICE` (`rmq.constants.ts:29`). `read-all` khai báo trước `:id`.

## Critical
Không còn bug mở.

## Major
Không còn bug mở.

## Minor

| ID | Mức | Nội dung |
|---|---|---|
| — | Minor | Quyền không đối xứng: `findById` cho người nhận lẫn người gửi (`notification.repository.ts:87`), `markAsRead`/`delete` chỉ người nhận (`:127`) → người gửi thấy trong list nhưng không xóa được (404). Cần xác nhận chủ ý. |
| — | Minor | `third/src/features/notification/notification.controller.ts` HTTP trùng route `/notifications` (đăng ký `notification.module.ts:9`); nếu third mở HTTP công khai thì bypass `RolesGuard` gateway. Chưa xác minh. |

## Sạch
IDOR: `getById/markAsRead/delete` lọc theo owner trừ ADMIN (`scopeUserId`); `getAll`/`markAllAsRead` luôn lấy `userId` từ JWT; `:id` có `assertUuid` ở service; `senderId` gateway ghi đè bằng `user.id` sau spread; `isRead` gateway→boolean; không có update schema; TUTOR chỉ gửi được tới lớp/học sinh mình dạy (`tutorOwnsClass`/`tutorTeachesStudent`); `content` bắt buộc ở cả UI và schema.

## Chưa xác minh
UI `app/` có thực sự gọi `create` và `markAllRead`; `DeleteResult`/`unwrapApiData`; third có mở HTTP; `ERROR_MESSAGES` (`NOTIFICATION_NOT_FOUND`, `PERMISSION_DENIED`) bên third.
