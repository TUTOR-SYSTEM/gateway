# Flow review: user

- Luồng: UI (`ui/lib/services/user.service.ts`, `ui/types/user.types.ts`) → gateway (`gateway/src/features/user/user.controller.ts`, `packages/entities/user/user.schema.ts`) → RMQ `user.*` → `user/src/features/user/{user.rpc.controller,user.service}.ts`.
- Phương pháp: sub agent `flow-review-user` đọc code, **chỉ đọc, chưa chạy test**. Ngày 2026-10-17.
- Thang mức độ: Critical = luồng hỏng hẳn; Major = sai hành vi/quyền/contract; Minor = lệch quy ước.
- Verdict: **CẦN SỬA** (0 Critical, 1 Major, 0 Minor). Tổng hợp chung: `auth-report.md` mục 5.

## Bảng luồng
| UI | HTTP | RMQ pattern | Khớp? |
|---|---|---|---|
| `apiGetCurrentUser` | GET /users/detail-user | `user.getDetailUser` | Có |
| `list` | GET /users (ADMIN) | `user.getUsers` | Có |
| `byField` | GET /users/get-by-field (ADMIN) | `user.getUserByField` | Có |
| `createManaged` | POST /users (ADMIN) | `user.createUser` | Có |
| `apiUpdateProfile` | PUT /users | `user.updateUser` | Có (xác nhận, xem M-USR-3) |
| `updateManaged` | PUT /users/:id (ADMIN) | `user.updateUserByAdmin` | Có |
| `toggleStatus` | PUT /users/:id/status (ADMIN) | `user.updateStatusUser` | Có |
| `deleteManaged` | DELETE /users/:id (ADMIN) | `user.deleteUserByAdmin` | Có |
| `changePassword` | POST /users/change-password | `user.changePassword` | Có |
| avatar (settings) `apiUploadFile` → `PUT /users` `{avatar}` | POST /upload, PUT /users | `upload.upload`, `user.updateUser` | Có |

## Major

| ID | Mức | Nội dung |
|---|---|---|
| M-USR-3 | Major | Xác nhận UI self-update (`PUT /users`, `UpdateUserProfilePayload`) không gửi `parentId`/`tutorId` (đã bỏ khỏi `updateSelfSchema`, service vẫn ném 400 `CANNOT_UPDATE_RESTRICTED_FIELDS` nếu có). Chưa xác minh bằng UI. |

## Minor

Không còn bug mở.

## Sạch
`password` loại khỏi response; `userId/actorId/actorRole` lấy từ `@CurrentUser()`; service có `assertAdmin/assertSelfOrAdmin`; `user.getDetailUser` nhận actor qua `splitRpcActor`; `isActive` được truyền cho `updateStatusUser`; `newPassword !== currentPassword` đã kiểm tra.

## Chưa xác minh
`ZodValidationPipe` strip hay reject key lạ trên `createUserSchema`; hook/component gọi `useUserActions`; `ui/lib/axios/api-error.ts`.
