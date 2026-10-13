# Nhật ký giải merge conflict — gateway

Ngày: 2026-10-13. Nguồn: HEAD `3ec472a` ("fix bug") chứa marker `<<<<<<< Updated upstream` (HEAD) / `>>>>>>> Stashed changes` (stash@{0}, WIP trên `chore/sync-2026-10-11`). Đã giải 19 hunk ở 9 file. Không còn marker nào (`git grep -E '^(<<<<<<<|=======$|>>>>>>>)'` rỗng).

Ký hiệu: **HEAD** = bên `Updated upstream`, **STASH** = bên `Stashed changes`.

## Kết quả kiểm tra

- `bun run typecheck` (tsc --noEmit): sạch.
- `bun run test` (jest): 44/44 suite, 475/475 test pass (sau khi sửa một chỗ, xem mục upload `sanitizeFilename` bên dưới).
- `eslint` trên `src/features/{admin,notification,redis,student,upload,user}` và `src/packages/guards`: sạch.
- `bun run lint:check` toàn repo: 44 lỗi "Parsing error ... not found by the project service" nằm ở các file `test/**` không có trong tsconfig. Đây là lỗi có sẵn, không liên quan conflict, không sửa.

## Quyết định theo file / hunk

### 1. src/features/admin/admin.controller.ts (3 hunk)

| Hunk | Dòng gốc | Chọn | Lý do |
|---|---|---|---|
| 1 | 122 | STASH | Chỉ khác comment. STASH giải thích role gắn server-side sau validate. |
| 2 | 146 | STASH | HEAD dùng `_query` nhưng tham số tên `query` → lỗi compile. STASH `{ ...query, role: 'TUTOR' }`, role đặt sau spread nên client không ghi đè được. |
| 3 | 219 | STASH | Giống hunk 2 cho `role: 'STUDENT'`. |

Quyền: `@UseGuards(RolesGuard)` + `@Roles('ADMIN')` ở cấp class, không đổi. Không bên nào bỏ kiểm tra quyền.

### 2. src/features/notification/notification.controller.ts (3 hunk)

| Hunk | Dòng gốc | Chọn | Lý do |
|---|---|---|---|
| 1 | 104 | STASH | `getById(id, user)` và forward `role: user.role`. Khớp test `notification.review-fix.spec.ts` (F-12) và `third/.../notification.rpc.controller.ts` (actorSchema nhận `role?`). |
| 2 | 122 | STASH | `markAsRead`, cùng lý do. |
| 3 | 140 | STASH | `delete`, cùng lý do. |

Quyền: không đổi. Lưu ý contract: payload `notification.getById|markAsRead|delete` giờ có thêm `role`. Phía THIRD hiện tại đã nhận `role` (optional), nên tương thích.

### 3. src/features/redis/redis.controller.ts (2 hunk)

| Hunk | Dòng gốc | Chọn | Lý do |
|---|---|---|---|
| 1 | 1 | STASH | Import `ForbiddenException` được dùng ở body (chặn key nhạy cảm). HEAD thiếu import này → lỗi compile. |
| 2 | 17 | STASH | Import `ERROR_MESSAGES` cho `ForbiddenException`. HEAD nhân đôi import `Roles`/`RolesGuard` đã có ở dòng 14-15 nên bỏ. |

Quyền: `@UseGuards(RolesGuard)` + `@Roles('ADMIN')` cấp class và cấp method `get`, giữ nguyên. Chặn `SENSITIVE_KEY_PREFIXES` giữ nguyên.

### 4. src/features/student/student.controller.ts (1 hunk)

| Hunk | Dòng gốc | Chọn | Lý do |
|---|---|---|---|
| 1 | 25 | STASH (rỗng) | HEAD import `RolesGuard` lần 2, đã có ở dòng import khác trong cùng file, nên trùng identifier. Bỏ bản HEAD. |

Quyền: không đổi.

### 5. src/features/upload/upload.controller.ts (4 hunk)

| Hunk | Dòng gốc | Chọn | Lý do |
|---|---|---|---|
| 1 | 29 | STASH + giữ `const MAX_FILE_SIZE` của HEAD | STASH thêm `Roles`, `RolesGuard`, `UPLOAD_KEY_PREFIX`, `assertValidKey`, `sanitizeFilename`. HEAD định nghĩa `MAX_FILE_SIZE` và phần này bị STASH bỏ, nhưng `FileInterceptor`/`FilesInterceptor` vẫn dùng nên giữ lại. |
| 2 | 81 | STASH | `ERROR_MESSAGES.UPLOAD_FILE_REQUIRED`. Key có sẵn trong `error.i18n.ts`. |
| 3 | 112 | STASH | `ERROR_MESSAGES.UPLOAD_FILES_REQUIRED`. Cùng lý do. |
| 4 | 146 | STASH | `download`: dùng `sanitizeFilename(result.filename ?? key)` + `X-Content-Type-Options: nosniff`. `delete`: thêm `@UseGuards(RolesGuard)` + `@Roles('ADMIN')`. |

Sửa thêm (không phải chọn bên): `sanitizeFilename` của STASH xoá `"`/CR/LF (`.replace(/["\r\n]/g, '')`). Test cũ `test/features/upload/upload.controller.spec.ts` GW-17 mong đợi `ev"il\r\nname.jpg` → `ev_il__name.jpg` (thay bằng `_`). Test review-fix mới (`upload.review-fix.spec.ts`) chỉ cần không còn CR/LF và đúng 2 dấu `"` bao quanh. Đổi thành `.replace(/["\r\n]/g, '_')` thoả cả hai, không sửa test.

Hành vi đổi so với HEAD: HEAD trả thêm `filename*=UTF-8''...` (RFC 5987), STASH không. Tên file có Unicode sẽ mất dạng mã hoá này. Chưa ghi nhận lỗi test nào vì test không cover.

Quyền: **thêm** `ADMIN` cho `DELETE /upload/:key` (HEAD không có). Không bỏ kiểm tra quyền nào. Test `upload.review-fix.spec.ts` yêu cầu đúng hành vi này.

### 6. src/features/user/user.controller.ts (3 hunk)

| Hunk | Dòng gốc | Chọn | Lý do |
|---|---|---|---|
| 1 | 25 | STASH (rỗng) | Import `RolesGuard` lần 2, trùng dòng 45. Bỏ bản HEAD. |
| 2 | 161 | HEAD | `updateUserController`: HEAD đặt `userId`/`role` **sau** spread, nên body không ghi đè được danh tính. STASH đặt trước spread, body có thể ghi đè. Schema `updateSelfSchema` đã omit `role`, nhưng `userId` chưa bị chặn ở gateway. Giữ thứ tự an toàn. |
| 3 | 251 | HEAD | `changePasswordController`: cùng lý do, `userId` đặt sau spread. |

Quyền: không bên nào bỏ kiểm tra. Các decorator `@Roles('ADMIN')` + `@UseGuards(RolesGuard)` trên các route `/:id`, `/:id/status`, `DELETE /:id` giữ nguyên. (Lưu ý: chúng bị khai báo lặp hai lần ở cùng method, đây là code nền không phải conflict, chưa sửa.)

### 7. src/packages/guards/jwt-auth.guard.ts (1 hunk, line 133) — chọn tay

Hunk: HEAD `if (!session) { this.sessionCache.delete(...)`, STASH `if (!sessionExists) { this.setCachedSession(payload.id, false)`.

- HEAD dùng biến `session` không tồn tại → lỗi compile. Chọn tên `sessionExists` của STASH.
- STASH ghi negative cache `valid=false`, nhưng `getCachedSession` trả entry bất kể `valid`, và `if (cached) return true`. Kết quả: user đã mất session vẫn được cho qua trong 5 giây. Đây là regression GW3-11 đã ghi trong `bugs/gateway.md`. Chọn `this.sessionCache.delete(payload.id)` của HEAD, khớp với fix GW-13.
- Kết quả: `if (!sessionExists) { this.sessionCache.delete(payload.id); throw Unauthorized('Session expired or not found ...') }`. Quyền được giữ nguyên: thiếu session vẫn 401. Không bỏ kiểm tra quyền.

Lưu ý: lựa chọn này là **sửa một phần GW3-11 ngay trong bước merge**. Phần ghi nhận trong `bugs/gateway.md` chưa được cập nhật, để bước fix sau xác nhận.

### 8. test/packages/guards/jwt-auth.guard.branches.spec.ts (1 hunk, line 175)

Chọn HEAD: `does not cache a negative session result (GW-13), re-checks Redis`. STASH encode đúng hành vi regression ("rejects from cache ... after a recent null session"). Đây là thay đổi test do conflict, không phải tự sửa để pass. Test file này được chọn theo đúng code guard đã chọn ở mục 7.

### 9. test/packages/guards/jwt-auth.guard.spec.ts (1 hunk, line 100)

Chọn HEAD: `does not cache an invalid session (GW-13): each request re-checks`. Cùng lý do mục 8.

## Có bên nào bị bỏ kiểm tra quyền không?

**Không.** Các thay đổi về quyền:
- upload `DELETE /:key`: thêm `ADMIN` (STASH).
- jwt guard: giữ 401 khi thiếu session, bỏ negative cache (cho phép đọc lại Redis, không nới quyền).
- user update/changePassword: giữ thứ tự HEAD, không nới quyền.

## Việc còn lại / quan sát ngoài phạm vi

- Repo `third/`, `user/`, `tutor/`: hiện không còn marker (`grep` rỗng). Lúc đầu có thấy marker ở `third/src/features/notification/notification.rpc.controller.ts` nhưng đã được giải trước khi kiểm tra lại, có thể do người khác làm song song. Không đụng vào các repo này.
- Các file `.claude/agents/*`, `reviews/*`, một số `src/...` khác trong `git diff HEAD stash@{0}` chưa bị động vào. Đây là phần merge tự động, không nằm trong 19 hunk.
- Bug trong `bugs/gateway.md` (GW3-11 đã được che phần chính; GW3-13, GW3-14, GW3-16, GW3-17, GW-27 vẫn còn) để bước fix sau xử lý.
