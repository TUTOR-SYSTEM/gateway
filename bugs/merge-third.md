# Merge conflict resolution — THIRD_SERVICE (TRD3-02)

Ngày: 2026-10-13. Repo: `tutor/third` (branch `chore/sync-2026-10-11`, HEAD `c88e26a` "fixbug").

## Hiện trạng
- HEAD commit `c88e26a` đã đưa 54 hunk conflict marker vào 24 file (16 trong `src/`, 8 trong `test/`).
- `stash@{0}` ("WIP on chore/sync-2026-10-11", `17235b1`) là nguồn đúng cho **toàn bộ** hunk.
  Nhánh `Stashed changes` của marker đều lấy từ đây.
- `stash@{1}` ("WIP on develop", `a26e8b3`) KHÔNG dùng. Bản đó là trạng thái cũ hơn và đi ngược
  các bản vá bảo mật: đưa lại fallback `'dev-insecure-jwt-secret'` trong `jwt-auth.guard.ts`, bỏ
  `resolveCorsOrigins`, bỏ `escapeLike`. Nó không chứa hunk nào của marker.
- Nhánh `Updated upstream` (HEAD) có 3 điểm đúng cần giữ: `assertUuid` (TRD3-26), `dto.routes ?? []`
  (TRD3-19), và `commandTimeout` 5s của redis. Các điểm này được ghép vào bản stash.

## Quy tắc chọn
- Chọn bên **stash** khi nó thêm/giữ kiểm tra quyền (`@Roles`/`RolesGuard`, `userId` bắt buộc ở RPC
  notification, role check khi tạo notification) hoặc sửa lỗi bảo mật.
- Chọn **HEAD** khi bên stash làm vỡ build hoặc thiếu guard (ví dụ `dto.routes.flatMap` khi `routes`
  không có, `NotFoundException` bị thiếu import, `file is required`).
- Ghép (MERGED) khi hai bên đúng ở hai phần khác nhau.

## Quyết định theo file

Ký hiệu: S = stash@{0}, U = HEAD (`Updated upstream`), M = ghép.
Cột "bỏ kiểm quyền?" trả lời: bên được bỏ có làm mất một kiểm tra quyền mà bên kia có không.

### src (16 file, 37 hunk)

| File | Hunk | Chọn | Lý do (1 dòng) | Bỏ kiểm quyền? |
|---|---|---|---|---|
| `src/features/email/email.controller.ts` | 2 | S | Thêm `@Roles('ADMIN')` + `RolesGuard` cho `GET /emails` (HEAD không có) | Không. Stash thêm kiểm tra |
| `src/features/notification/notification.controller.ts` | 3 | S | Truyền `{ userId, role }` xuống service (HEAD chỉ truyền `userId`) | Không |
| `src/features/notification/notification.repository.ts` | 3 | S | `markAsRead`/`delete` chỉ theo người nhận (`ownedBy`); `findById` vẫn cho người nhận hoặc người gửi; ADMIN không bị scope (`userId` undefined) | Có một phần: người gửi (HEAD cho phép) không còn markAsRead/delete được notification mình gửi. Đây là thu hẹp quyền, không phải mất kiểm tra |
| `src/features/notification/notification.rpc.controller.ts` | 2 | S | `actorSchema` bắt buộc `userId` (HEAD để `userId?` optional nên thiếu userId = không scope = IDOR, TRD-04) | Không. Stash thêm kiểm tra |
| `src/features/notification/notification.service.ts` | 4 | M | Lấy stash (`NotificationActor`, role check khi create, `scopeUserId`) và giữ `assertUuid` của HEAD (404 thay vì lỗi PG, TRD3-26) | Không. Stash thêm kiểm tra |
| `src/features/redis/redis.service.ts` | 1 | M | `maxRetriesPerRequest: 3` (stash, fail nhanh) + `commandTimeout: 5_000` (HEAD, chặn treo; khớp `conventions.md`) | Không liên quan authz |
| `src/features/test-scenario/test-scenario.service.ts` | 1 | U | `dto.routes ?? []` của HEAD; stash `dto.routes.flatMap` sẽ crash khi routes undefined (TRD3-19) | Không liên quan authz |
| `src/features/uploads/upload.constant.ts` | 1 | S | Bản stash đầy đủ (`MAX_UPLOAD_FILES`, whitelist); giữ doc comment của HEAD | Không |
| `src/features/uploads/upload.controller.ts` | 3 | S | `DELETE /upload/:key` có `@UseGuards(RolesGuard) @Roles('ADMIN')` (HEAD: bất kỳ user đăng nhập xoá được mọi object R2, TRD3-05); download có log lỗi pipeline | Không. Stash thêm kiểm tra |
| `src/features/uploads/upload.module.ts` | 2 | S | Dùng hằng `MAX_UPLOAD_FILES` (stash), cùng giá trị 10 | Không |
| `src/features/uploads/upload.rpc.controller.ts` | 3 | M | Stash: contract base64 + check số file. HEAD: import `NotFoundException` (stash thiếu, dùng trong `download`) và guard `file is required` | Không. Lưu ý: `upload.delete` RPC vẫn không có role check ở cả hai bên (TRD3-04/05 còn mở) |
| `src/features/uploads/upload.service.ts` | 4 | S | Whitelist MIME/extension, `requireS3`, log lỗi decode ảnh | Không |
| `src/packages/configs/jwt-sign.config.ts` | 2 | M | Doc comment của HEAD + message lỗi của stash; cả hai đều throw khi thiếu secret, không fallback | Không |
| `src/packages/entities/notification/notification.schema.ts` | 1 | S | Chỉ khác comment; logic `isRead` giống nhau | Không |
| `src/packages/guards/token-bucket.guard.ts` | 2 | M | HEAD: fail-open + key theo route pattern; stash: `withTimeout` 500ms (TRD3-12). Ghép cả hai | Không. Fail-open khi Redis lỗi đã có ở cả hai bên, không phải kiểm tra authz |
| `src/packages/interceptor/trace-context.interceptor.ts` | 3 | S | Redaction đầy đủ hơn (độ sâu, marker buffer, mask JWT, bỏ body `upload.*`) | Không |

Ngoài hunk marker (không phải conflict, nhưng làm TS2300 khi typecheck):
- `src/packages/guards/jwt-auth.guard.ts` và `src/features/log/log.gateway.ts`: có hai dòng
  `import { resolveJwtAccessSecret } ...` trùng nhau. Đã có sẵn trong HEAD. Xoá bản thứ hai ở mỗi file.
  Không đổi logic.

### test (8 file, 17 hunk)

| File | Hunk | Chọn | Lý do |
|---|---|---|---|
| `test/features/email/email.controller.spec.ts` | 2 | S | Khớp decorator ADMIN mới; assert `ROLES_KEY = ['ADMIN']` |
| `test/features/log/log.gateway.spec.ts` | 2 | S | `toHaveBeenCalledTimes(1)` chặt hơn `toHaveBeenCalled()` |
| `test/features/notification/notification.rpc.controller.spec.ts` | 1 | S | Khớp signature `{ userId, role }` của service và RPC mới |
| `test/features/uploads/upload.branches.spec.ts` | 2 | S | Khớp controller stash (`PassThrough`) |
| `test/features/uploads/upload.controller.spec.ts` | 5 | M | Giữ assert `toBeUndefined` và tên test của HEAD (2 hunk). Dùng stash cho `download` streams và omit Content-Length (2 hunk). Giữ test HEAD-only `download sanitises the filename` |
| `test/features/uploads/upload.edge.spec.ts` | 2 | U | HEAD có test POST + DELETE + GET download đúng. Comment "SECURITY (expected to fail)" của stash bị lỗi thời vì code stash không còn `@Public` |
| `test/features/uploads/upload.rpc.controller.spec.ts` | 1 | M | Giữ tên test NoSuchKey → 404 của HEAD và thêm test base64 của stash (gateway contract) |
| `test/packages/guards/jwt-auth.guard.spec.ts` | 2 | U | Giữ assert `toThrow('JWT_ACCESS_SECRET')` của HEAD (`toBeDefined()` của stash quá yếu) |

Các test này chỉ được sửa ở vùng marker. Không viết test mới, không đổi assert để cho pass.

## Có bên nào bị bỏ kiểm tra quyền không
- Không có kiểm tra quyền nào của HEAD bị bỏ. Stash thêm kiểm tra ở: `GET /emails` (ADMIN), `DELETE /upload/:key`
  (ADMIN), `notification.*` RPC (userId bắt buộc, role khi create).
- Thu hẹp (không phải bỏ): `markAsRead`/`delete` notification chỉ còn người nhận (HEAD cho cả người gửi).
- Có chủ đích, giữ từ stash: ADMIN không bị scope theo `userId` ở notification (`scopeUserId` trả undefined).
- Còn mở (không do merge, cả hai bên đều vậy): `upload.delete` RPC và `upload.download` RPC không có role check
  (TRD3-04/05); `redis.get`/`set`/`del` RPC không có authz (TRD3-04). Phần này thuộc bước fix bug sau.

## Xác nhận
- Marker: `grep -rE '^(<<<<<<<|=======|>>>>>>>)' src test` → 0 dòng.
- `bun run typecheck` (tsc --noEmit) → sạch.
- `bun run test` (jest) → 68/68 suite, 767/767 test pass.
- `bun run lint:check` → còn lỗi có sẵn, không do merge:
  - 70 lỗi `Parsing error ... not found by the project service`: file test không nằm trong tsconfig. Áp dụng cho mọi file test, không chỉ file conflict.
  - 1 lỗi `src/database/database.module.ts:10` `'_default' is assigned a value but never used`. Dòng này có sẵn trong HEAD và stash@{1}. Chưa sửa (ngoài phạm vi merge).

## Không làm trong bước này
- Không commit, không push, không `git stash` / reset / checkout / restore / clean / drop.
- Không đụng `.env*`, `drizzle/`, không đổi schema.
- Không sửa các bug trong `gateway/bugs/third.md` (TRD3-xx) ngoài phần conflict. Bước fix sẽ làm sau.
