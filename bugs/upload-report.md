# Flow review: upload

- Luồng: UI (`apiUploadFile`/`apiDownloadFile` ở `ui/lib/services/student.service.ts:21,32` và 6 component) → gateway (`gateway/src/features/upload/upload.controller.ts`) → RMQ `upload.*` → `third/src/features/uploads/{upload.rpc.controller,upload.service}.ts`.
- Phương pháp: sub agent `flow-review-upload`, **chỉ đọc, chưa chạy test**. Ngày 2026-10-17.
- Verdict: **OK** (0 Critical, 0 Major, 3 Minor). Tổng hợp chung: `auth-report.md` mục 5.

## Bảng luồng
| UI | HTTP | RMQ | Khớp? |
|---|---|---|---|
| `apiUploadFile` | POST /upload (field `file`) | `upload.upload` | Có |
| (không có UI) | POST /upload/multiple (field `files`, tối đa 10) | `upload.uploadMultiple` | Có, UI không dùng |
| `apiDownloadFile` + 6 component | GET /upload/download?key= | `upload.download` | Có |
| (không có UI) | DELETE /upload/:key (ADMIN) | `upload.delete` `{key, role}` | Có, UI không dùng |

4/4 pattern khớp. `upload` → `THIRD_SERVICE` (`rmq.constants.ts:30`); override timeout 60000ms, `maxRetries 0` (`rmq.constants.ts:77`). `apiUploadAvatar` (`POST /users/avatar`) không thuộc module này (route không tồn tại, xem `user-report.md` M-USR-5).

## Critical
Không còn bug mở.

## Major
Không còn bug mở.

## Minor

| ID | Mức | Nội dung |
|---|---|---|
| — | Minor | `DELETE /upload/:key` với key chứa `/` chỉ chạy khi client encode `%2F`; một số proxy chặn. Đổi sang `DELETE /upload?key=` (`upload.controller.ts:150`). |
| — | Minor | Trùng validate key: gateway `assertValidKey` dùng `ERROR_MESSAGES`, service message hardcode tiếng Anh (`upload.service.ts:77`, `rpc:42`); nên dùng `ERROR_MESSAGES`. |
| — | Minor | `UPLOAD_KEY_PREFIX` định nghĩa riêng ở gateway (`upload.controller.ts:36`) và third (`upload.constant`); có nguy cơ lệch giữa hai repo. |

## Sạch
Chống path traversal ở cả hai tầng; `upload.delete` fail-closed theo role (`rpc:83`) và `@Roles('ADMIN')` ở gateway; `Content-Disposition` sanitize + RFC5987; giới hạn 10MB ở gateway (multer) và service; `uploadMultiple` rollback file đã ghi khi lỗi; download không còn đọc file vào bộ nhớ dạng base64 qua RMQ và không còn ép `application/octet-stream`; download/upload chỉ cho user đăng nhập đúng quyền; không log nội dung file; không dùng raw `ClientProxy`.

## Chưa xác minh
`ResponseInterceptor` bỏ qua response dùng `@Res()`; `RolesGuard` lấy `user` từ guard global ở route DELETE; `MAX_UPLOAD_BYTES`, `MAX_UPLOAD_FILES`, `UPLOAD_KEY_PREFIX` bên third khớp gateway; giới hạn message size RabbitMQ; `api-error.ts`.
