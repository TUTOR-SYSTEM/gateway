# Review: user

## Tổng quan

- **Scope**: `D:\projects\user\src` (auth, user, admin, student, rabbitmq, guards, filters, interceptors, helpers, strategy, database) và `scripts/`. Bỏ qua `node_modules`, `dist`. Đã đọc CLAUDE.md, AGENTS.md, API_ENDPOINTS.md và `architech/auth-flows-rmq.md`. Đối chiếu thêm một số file của `gateway` (user/student/auth controller) và `third` (redis rpc) để kiểm tra hợp đồng RMQ.
- **Files đã đọc kỹ**: `auth.service.ts`, `auth.rpc.controller.ts`, `auth.controller.ts`, `user.service.ts`, `user.repository.ts`, `user.rpc.controller.ts`, `admin.service.ts`, `admin.repository.ts`, `student.service.ts`, `student.repository.ts`, `student.controller.ts`, `rpc-exception.filter.ts`, `error.interceptor.ts`, `trace-context.interceptor.ts`, `rmq.producer.ts`, `main.ts`, `jwt-auth.guard.ts`, `jwt-sign.config.ts`, `jwt.helper.ts`, zod schema (auth/user/admin/student), `database/schema.ts`, strategy Google/Facebook, `app.controller.ts`, seed scripts.
- **Nhận định chung**: Phần login/refresh trong `auth.service.ts` được viết khá cẩn thận (chống enumeration, dummy hash, kiểm tra `typ`, refresh gắn với session trong Redis). Các lỗi nghiêm trọng nằm ở: (1) **không có kiểm soát phân quyền ở tầng RPC** và gateway không gắn `@Roles` cho `/users/*`, `/students/*`; (2) **rò rỉ thông tin** (password hash trong response student, SQL + params trong lỗi RPC, log plaintext password); (3) **mật khẩu mặc định cố định** cho học sinh/phụ huynh kết hợp đăng nhập bằng `userCode`; (4) **không thu hồi session** sau đổi/reset mật khẩu, khoá tài khoản; (5) nhiều race/uniqueness không có ràng buộc DB (userCode, email phân biệt hoa thường). CLAUDE.md nói `admin`/`student` có RPC handler nhưng thực tế chỉ có `auth.*` và `user.*`.
- Không sửa file nguồn nào. Các mục không chắc chắn nằm ở phần "Cần xác minh".

## Thống kê

| Severity | Số lượng |
|---|---|
| Critical | 2 |
| High | 7 |
| Medium | 15 |
| Low | 7 |
| **Tổng** | **31** |

## Danh sách bug

| ID | Severity | File:line | Mô tả | Kịch bản lỗi | Đề xuất sửa |
|---|---|---|---|---|---|
| USR-01 | Critical | `src/features/user/user.rpc.controller.ts:25-56`, `src/features/user/user.service.ts:133,153,275`; gateway `gateway/src/features/user/user.controller.ts` (không có `@Roles`/`@UseGuards`) | RPC handler `user.createUser`, `user.updateUserByAdmin`, `user.updateStatusUser`, `user.deleteUserByAdmin`, `user.getUserByField` không kiểm tra vai trò; gateway `/users/*` cũng không gắn `RolesGuard` (HTTP controller của service này thì có `@Roles('ADMIN')`). `createUserService` nhận `role` từ DTO (kể cả `ADMIN`). | User STUDENT đăng nhập gọi `POST /users` với `role:'ADMIN'` để tạo admin, `DELETE /users/:id` xoá bất kỳ ai, `PUT /users/:id/status` khoá admin, `GET /users/get-by-field?field=email&value=...` tra PII mọi người. | Gateway: thêm `@UseGuards(RolesGuard) @Roles('ADMIN')` cho các route tương ứng. User service: truyền `actor {id, role}` trong payload RPC và kiểm tra lại trong service (defense in depth). |
| USR-02 | Critical | `src/features/student/student.service.ts:103,113,308`; `src/features/auth/auth.service.ts:202-212`; `src/packages/helpers/generate.helper.ts:6` | Học sinh/phụ huynh tạo qua `/students` đều có mật khẩu cố định `Student@123456` / `Parent@123456`. `userCode` 6 ký tự sinh bằng `Math.random`; `POST /auth/login/user-code` chỉ cần `userCode + password + role`. | Biết hoặc dò `userCode` (36^6, hoặc lấy từ danh sách `GET /students`) rồi đăng nhập bằng mật khẩu mặc định, chiếm tài khoản học sinh/phụ huynh. | Sinh mật khẩu ngẫu nhiên và gửi một lần, hoặc bắt buộc đổi mật khẩu lần đầu. Dùng `crypto.randomInt` cho mã. Thêm rate limit/khoá tạm khi sai mật khẩu. |
| USR-03 | High | `src/packages/filters/rpc-exception.filter.ts:49` | Lỗi không phải `HttpException` (kể cả lỗi Postgres/Drizzle) trả `exception.message` nguyên văn qua RPC. `ErrorInterceptor` (làm sạch "Failed query") chỉ đăng ký cho HTTP app (`main.ts:63`) nên không áp dụng cho RPC. Drizzle 0.45 message dạng `Failed query: <sql>\nparams: <giá trị>`. | Đăng ký trùng email (race) hoặc `getUserByField` với id sai UUID gây lỗi DB, message gồm SQL và params (email, bcrypt hash) đi về gateway, tới client nếu gateway chuyển tiếp. Luôn trả 500 thay vì 400/409. | Trong filter: ánh xạ mã Postgres (23505 -> 409, 23503 -> 400, 22P02 -> 400), che message khi `startsWith('Failed query')`, log chi tiết nội bộ. |
| USR-04 | High | `src/features/student/student.service.ts:149,341`; `student.repository.ts:33,53,77` | `create()` và `update()` trả nguyên row `users` từ `.returning()` (có cột `password`). | `POST /students` và `PUT /students/:id` trả bcrypt hash của học sinh (mật khẩu là hằng số đã biết, xem USR-02). | Trả projection không có `password` (`omitPassword` hoặc select cột công khai). |
| USR-05 | High | `src/features/auth/auth.controller.ts:257` | `console.log(resetPasswordDto)` in `jti`, `password`, `confirmPassword` plaintext ra stdout. | Mỗi lần reset mật khẩu, mật khẩu mới và token reset nằm trong log container. | Xoá dòng log. |
| USR-06 | High | `src/features/auth/auth.controller.ts:223` (HTTP); gateway `auth.controller.ts:224` | `POST /auth/reset-password` thiếu `@Public()` (chỉ có `@ApiBearerAuth`) trong khi người quên mật khẩu không có access token. Tài liệu auth-flows cũng ghi "cần bearer". | Người dùng bấm link trong email, gọi reset không có Bearer thì bị 401; luồng forgot/reset hỏng với người đã quên mật khẩu. | Thêm `@Public()` ở cả gateway và service này; xác thực chỉ bằng `jti`. |
| USR-07 | High | `src/features/auth/auth.service.ts:251-271`; `src/features/user/user.service.ts:189-204,258-272,275-288,292-305` | Đổi mật khẩu, reset mật khẩu, khoá (`isActive=false`), xoá user không xoá `session:{userId}` trong Redis và không thu hồi token. Refresh token vẫn hợp lệ tới 7 ngày; access token 3h. `logoutService` là mã chết (không có pattern nào gọi). | Tài khoản bị lộ: nạn nhân đổi/reset mật khẩu nhưng kẻ tấn công vẫn gọi `/auth/refresh` để sinh token mới. | Sau khi đổi/reset/khoá/xoá, `redis.del` `session:{userId}`; cân nhắc `tokenVersion` trong JWT. |
| USR-08 | High | `src/database/schema.ts:43-44` | `parentId` và `tutorId` tự tham chiếu với `onDelete: 'cascade'`. | Admin xoá một tutor (`DELETE /admin/tutors/:id`, `user.deleteUserByAdmin`) thì toàn bộ học sinh/phụ huynh có `tutorId` đó bị xoá hàng loạt; xoá parent xoá luôn học sinh. Mất dữ liệu không khôi phục được. | Đổi sang `set null` (migration ở gateway, schema canonical) hoặc chặn xoá khi còn quan hệ. |
| USR-09 | High | `src/features/auth/auth.service.ts:116-140,143-171` | Đăng ký không xác minh email; OAuth `findOrCreateOAuthUser` gộp tài khoản theo email có sẵn mà không kiểm tra email đã xác minh và không lưu `googleId`/`facebookId`. | Kẻ tấn công đăng ký trước bằng email nạn nhân (mật khẩu của hắn). Khi nạn nhân đăng nhập Google vào đúng tài khoản đó, kẻ tấn công vẫn có mật khẩu (pre-hijack). | Xác minh email trước khi dùng tài khoản; khi OAuth gộp tài khoản chỉ tin email verified, lưu provider id, vô hiệu mật khẩu cũ khi liên kết. |
| USR-10 | Medium | gateway `user.controller.ts:142` (`{ userId, role, ...dto }`) + `src/features/user/user.rpc.controller.ts:42-46` | `updateUserSchema` cho phép `role` trong body; spread `...dto` đặt sau `role: _user.role` nên ghi đè role người gọi. RPC lại destructure `role` ra khỏi `data`. Role không bị escalate (bị bỏ) nhưng kiểm tra `STUDENT_CANNOT_UPDATE_NAME` dùng role do client gửi; mục `'role'` trong `SELF_UPDATE_RESTRICTED_FIELDS` (`user.service.ts:247`) thành mã chết. | STUDENT gửi `{ "role": "TUTOR", "firstName": "X" }` vượt qua hạn chế "học sinh không được đổi tên". `role` bị âm thầm bỏ thay vì báo lỗi. | Gateway: đặt `userId`/`role` SAU spread. RPC: nhận actor riêng, không tin role trong data. |
| USR-11 | Medium | `src/features/auth/auth.service.ts:106,298-311` | Session chỉ lưu bằng `redis.set` fire-and-forget (không await) và chỉ 1 session/user. `assertRefreshSessionActive` fail-closed khi key không có (`null !== token`) nhưng fail-open khi RMQ lỗi. | (a) Login rồi refresh ngay trước khi `redis.set` xong, hoặc `redis.set` lỗi/Redis restart: `/auth/refresh` luôn 401. (b) Đăng nhập thiết bị thứ 2 ghi đè token thiết bị 1. (c) Hai tab refresh song song: một tab bị loại. (d) Khi third-service lỗi, token đã bị thu hồi vẫn refresh được. | Lưu session theo `jti`/thiết bị, await `redis.set` hoặc có retry; quyết định rõ chính sách fail-open/closed. |
| USR-12 | Medium | `src/features/auth/auth.service.ts:255-268` | Reset token dùng 1 lần nhưng get -> update -> `emit redis.del` không atomic; xoá là best-effort. | Hai request reset đồng thời cùng thành công; mất message `redis.del` thì token còn dùng được tới hết 300s. | Dùng `GETDEL` (thêm pattern ở third-service) hoặc xoá trước khi cập nhật. |
| USR-13 | Medium | `src/packages/interceptor/trace-context.interceptor.ts:22-30,569` | `SENSITIVE_KEYS` không có `jti`, `currentPassword`, `resetToken`...; body `auth.resetPassword` (có `jti`) và `user.changePassword` (`currentPassword`) được ghi vào `request_logs` (qua `log.create`). | Ai đọc được `log.query` lấy `jti` còn hạn (5 phút) rồi đặt lại mật khẩu bất kỳ user; `currentPassword` lộ trong log. | Thêm `jti`, `currentPassword`, `resetToken` vào danh sách che. |
| USR-14 | Medium | `src/features/auth/auth.service.ts:146-171`, `src/features/user/user.service.ts:137-168`, `src/database/schema.ts:21` | Email không chuẩn hoá (lowercase/trim) trong register/login/forgot/createUser, nhưng admin lại `toLowerCase()` (`admin.service.ts:96`). Ràng buộc `unique` phân biệt hoa thường. | `A@x.com` và `a@x.com` thành 2 tài khoản; email do admin tạo bị lowercase, người dùng gõ `John@x.com` đăng nhập báo sai; forgot-password không tìm thấy. | Chuẩn hoá email về lowercase+trim ở mọi điểm vào, unique index trên `lower(email)`. |
| USR-15 | Medium | `src/features/auth/auth.service.ts:146-171`, `user.service.ts:137-168`, `student.service.ts:102-111`, `admin.service.ts:97-109` | Kiểm tra trùng email/username là check-then-insert, không transaction, không bắt `23505`. | Hai request đăng ký (hoặc OAuth callback) đồng thời cùng email: một request nhận lỗi DB thô 500 (và rò SQL, USR-03) thay vì 400 `EMAIL_EXISTS`. | Bắt lỗi unique (23505) và ánh xạ sang 409/400; hoặc `INSERT ... ON CONFLICT`. |
| USR-16 | Medium | `src/database/schema.ts:31`, `src/features/user/user.service.ts:155-162`, `admin.service.ts:257-264`, `student.service.ts:28-42`, `src/features/auth/auth.service.ts:208` | `userCode` không có ràng buộc unique. `createUserService` thử 5 lần rồi vẫn dùng mã trùng (không throw). `loginByUserCode` lấy `rows.find(role)` đầu tiên rồi so mật khẩu. `updateUserService` (`user.service.ts:207-231`) không kiểm tra trùng `userCode`. | Hai TUTOR/STUDENT trùng mã: một người không bao giờ đăng nhập được hoặc đăng nhập nhầm tài khoản. | Unique index (partial `userCode IS NOT NULL`), throw khi hết lần thử, bắt 23505. |
| USR-17 | Medium | `src/features/student/student.service.ts:117,132,295,309-314` | Phụ huynh không có email được lưu `email: ''`; `email` là `unique` nên phụ huynh thứ 2 không có email gây lỗi 23505. Tạo parent rồi student là 2 insert không transaction (lỗi ở student để lại parent mồ côi). `updateParent` đổi `email` (dòng 295) không kiểm tra trùng. | Tạo học sinh thứ hai có `parentName` nhưng không có `parentEmail` thì 500; parent mồ côi sau lỗi. | Dùng email placeholder duy nhất hoặc cho phép NULL; bọc `db.transaction`; kiểm tra trùng email khi cập nhật. |
| USR-18 | Medium | `src/features/user/user.service.ts:133-177`, `src/packages/entities/user/user.schema.ts:344-440` | `createUserService` chỉ dùng `email, firstName, lastName, password, username, role`; bỏ qua `phone, gender, userCode, parentId, tutorId, gradesId, school, address...` dù `createUserSchema` nhận. `userCode` chỉ sinh cho TUTOR nên STUDENT/PARENT tạo qua `/users` không đăng nhập `user-code` được. | Admin tạo học sinh qua `POST /users` mất toàn bộ trường hồ sơ và không có mã đăng nhập. | Ghi đủ các trường hợp lệ; sinh `userCode` cho STUDENT/PARENT; kiểm tra FK. |
| USR-19 | Medium | `src/packages/entities/auth/auth.schema.ts:36-65`, `user.schema.ts:192-229,366-409`, `admin.schema.ts:12-70` | Chính sách mật khẩu không nhất quán: login/register/reset 6-25 + bắt buộc phức tạp; createUser 6-20, kiểm phức tạp chỉ khi dài 8-100; admin 6-20, kiểm chỉ khi dài 8-14; change-password 8-14. Login cũng áp luật phức tạp. | Tài khoản tạo với mật khẩu ngắn/không phức tạp (vd `abc123`, 6-7 ký tự bỏ qua kiểm tra) bị schema đăng nhập của gateway từ chối 422, không bao giờ đăng nhập được. Mật khẩu 20 ký tự đổi qua change-password bị từ chối. | Một schema mật khẩu dùng chung cho tạo/đổi/reset; `login` chỉ cần `min(1)`. Bỏ giới hạn max 14/20 (bcrypt tối đa 72 bytes). |
| USR-20 | Medium | `src/packages/entities/auth/auth.schema.ts:54`, `user.schema.ts:350-355`, `user.service.ts:49-65` | `username` đăng ký không giới hạn độ dài; `createUserSchema` cho 100 nhưng cột là `varchar(50)`; username sinh từ tên (tối đa 100+100 ký tự) có thể vượt 50; tên không phải Latin cho username rỗng. | Đăng ký username 60 ký tự -> lỗi DB 22001 -> 500 kèm SQL (USR-03). | Thêm `.max(50)`, cắt username sinh tự động ở 50, fallback khi rỗng. |
| USR-21 | Medium | `src/features/student/student.controller.ts:27-266` | Toàn bộ `/students` (HTTP của service này) không có `RolesGuard`/`@Roles`: mọi người đăng nhập (kể cả STUDENT/PARENT) tạo/sửa/xoá học sinh bất kỳ. Không kiểm tra sở hữu (`tutorId`). `:id` không validate UUID. | Một tutor sửa/xoá học sinh của tutor khác (IDOR); `GET /students/abc` -> 500 do lỗi cast uuid. | Gắn `@Roles('ADMIN','TUTOR')` + lọc theo `tutorId`; validate UUID. (Gateway hiện không gọi các route này, xem Tích hợp.) |
| USR-22 | Medium | `src/features/auth/auth.service.ts:116-140`, `src/packages/strategy/google.strategy.ts:34-40` | OAuth user mới không lưu `googleId/facebookId/avatar` dù profile có; tạo song song có thể trùng (USR-15). | Callback đồng thời hai lần -> 500. Không thể liên kết/hủy liên kết provider. | Lưu provider id, xử lý unique conflict. |
| USR-23 | Medium | `src/packages/configs/jwt-sign.config.ts:17-21`, `src/packages/strategy/jwt-user.strategy.ts:10`, `src/app.module.ts:122-125` | Secret JWT có fallback cứng `'dev-insecure-jwt-secret'` / `'dev-insecure-secret'`; `JWT_REFRESH_SECRET` mặc định bằng access secret (`jwt-sign.config.ts:21`). Không fail-fast khi thiếu env. | Deploy thiếu biến môi trường vẫn chạy với secret công khai, ai cũng ký được token ADMIN. | `getOrThrow` ở production; bắt buộc hai secret khác nhau. |
| USR-24 | Medium | `src/packages/strategy/facebook.strategy.ts:60-61`, `src/features/auth/auth.module.ts:23` | `FACEBOOK_APP_ID/SECRET` dùng `!` không fallback (Google thì có). `FacebookStrategy` luôn được đăng ký. | Nếu env thiếu, `passport-facebook` ném lỗi khi khởi tạo và service không boot (Cần xác minh). | Fallback như Google hoặc đăng ký có điều kiện. |
| USR-25 | Low | `src/features/auth/auth.service.ts:91` | Sai thông tin đăng nhập trả `400 BadRequest` (`INVALID_CREDENTIALS`) thay vì 401; tài liệu auth-flows nêu `USER_NOT_FOUND`/`INVALID_PASSWORD` (đã lỗi thời). | Client không phân biệt lỗi đăng nhập với lỗi payload. | Đổi sang `UnauthorizedException`, cập nhật tài liệu. |
| USR-26 | Low | `src/features/auth/auth.service.ts:225-249` | `forgotPassword` trả `{ok:true}` ngay khi email không tồn tại, nhưng email tồn tại thì `await` 2 lệnh RMQ (chậm hơn, có thể 504). Gửi cả cho tài khoản bị khoá. Không rate limit. Tài liệu ghi `400 USER_NOT_FOUND`. | Dò email tồn tại qua thời gian phản hồi/lỗi; spam email reset. | Xử lý bất đồng bộ cho cả hai nhánh, rate limit, bỏ qua tài khoản inactive. |
| USR-27 | Low | `src/features/user/user.service.ts:102-108` | `getDetailUserService` trả `null` khi không thấy (gateway trả 200 data null) thay vì 404. `GET /admin/tutors/:id`, `/admin/students/:id` qua gateway dùng handler này. | `GET /admin/tutors/<uuid không tồn tại>` trả 200 rỗng. | Ném `NotFoundException`. |
| USR-28 | Low | `src/features/user/user.service.ts:111-125`, `user.repository.ts:15-27`, `student.repository.ts:185-191` | `getUserByField({field:'id', value:'abc'})` truyền thẳng vào cột uuid -> Postgres 22P02 -> 500. `getStudentByField` dùng `fieldMap[field]` có thể `undefined`. | `GET /users/get-by-field?field=id&value=abc` -> 500. | Validate UUID khi `field==='id'`; schema `field` là enum. |
| USR-29 | Low | `src/features/user/user.service.ts:270` | `updateStatusUserService` là toggle (`!user.isActive`), không idempotent. | Retry của `RmqProducer` (3 lần khi timeout) hoặc bấm đúp làm trạng thái lật lại. | Nhận `isActive` tường minh. |
| USR-30 | Low | `src/main.ts:38-45`; `src/features/rabbitmq/rmq.producer.ts:251-307` | Listener RMQ không đặt `noAck` (mặc định Nest là `true`: ack trước khi xử lý), không DLQ/poison handling. `RmqProducer.send` retry cả lỗi nghiệp vụ (không chỉ timeout) và cả lệnh không idempotent (`email.sendForgotPasswordMail`). | Email reset gửi trùng khi timeout; lỗi 4xx từ service khác bị retry 3 lần với backoff. | Chỉ retry `TimeoutError`; không retry lệnh có side-effect; cân nhắc `noAck:false` + DLX. |
| USR-31 | Low | `src/app.controller.ts:112`; `scripts/seed-user.ts:49-60,113-122`; `scripts/recreate-db.ts:27-48`; `user.repository.ts:361`, `admin.repository.ts:414`, `queryList.helper.ts:44` | (a) `health.postgres` gọi `db.query.users.findMany()` tải cả bảng chỉ để đếm và trả mẫu user có email. (b) Seed khai báo `userCode` (ABC123/ABC456) nhưng không insert nên đăng nhập user-code seed không hoạt động. (c) `recreate-db.ts` DROP toàn bộ bảng không guard `NODE_ENV`. (d) `%`/`_` trong `search` không được escape. (e) Handler `kafka.*` còn lại trả dữ liệu giả. | Chạy nhầm script lên DB thật xoá sạch dữ liệu; health check chậm khi bảng lớn. | Dùng `count()`, thêm `userCode` vào insert seed, guard môi trường, escape ký tự LIKE, xoá handler `kafka.*`. |

## Chi tiết

### USR-01 (Critical) Thiếu phân quyền cho RPC user.* và route gateway /users

`gateway/src/features/user/user.controller.ts` không có `@Roles`/`@UseGuards` (grep không ra kết quả). Bản HTTP trong service này có:

```ts
// src/features/user/user.controller.ts:109-111
@UseGuards(RolesGuard)
@Roles('ADMIN')
@Post()
```

Nhưng đường thực tế là gateway -> RMQ, và handler RPC không kiểm tra gì:

```ts
// src/features/user/user.rpc.controller.ts
@MessagePattern('user.createUser')
createUser(@Payload() dto: CreateUserDto) { return this.userService.createUserService(dto); }
@MessagePattern('user.deleteUserByAdmin')
deleteUserByAdmin(@Payload() { id }: { id: string }) { return this.userService.deleteUserByAdminService({ id }); }
```

`createUserService` dùng `createUserDto.role ?? 'STUDENT'` (`user.service.ts:153`) và `createUserSchema` cho phép `ADMIN` (`user.schema.ts:402`). Kết quả: leo thang đặc quyền (tự tạo admin), xoá/khoá bất kỳ tài khoản. `deleteUserByAdminService` cũng không loại trừ chính mình hay admin khác.

### USR-02 (Critical) Mật khẩu mặc định cố định + userCode

```ts
// src/features/student/student.service.ts:103
const hashedStudentPassword = await hashData('Student@123456');
// :113 & :308
const hashedParentPassword = await hashData('Parent@123456');
```
```ts
// src/features/auth/auth.service.ts:208
const found = rows.find((u) => u.role === dto.role);
```
`userCode` sinh bằng `Math.random` (`generate.helper.ts:6`) và hiển thị trong danh sách học sinh. Không có rate limit ở service này (`throttle.decorator.ts` chỉ là metadata, không có guard đọc). Kẻ biết mã học sinh đăng nhập ngay. Seed cũng dùng cùng mật khẩu (`seed-user.ts`).

### USR-03 (High) RpcExceptionFilter làm lộ SQL và params

```ts
// src/packages/filters/rpc-exception.filter.ts:49-57
const message = exception instanceof Error ? exception.message : 'Internal server error';
return throwError(() => ({ statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message, serviceName: SERVICE_NAME }));
```
`ErrorInterceptor` có logic xử lý `Failed query:` và mã `23505` (`error.interceptor.ts:386-404`) nhưng chỉ gắn vào HTTP (`main.ts:63`). `TraceContextInterceptor` còn ghi `errorMessage` thô vào `request_logs` (`:595`). `DrizzleQueryError.message` chứa `params`, bao gồm hash mật khẩu khi insert user thất bại.

### USR-04 (High) Student create/update trả password hash

`createStudent` và `update` dùng `.returning()` không projection (`student.repository.ts:33,53,77`), service trả thẳng ở `student.service.ts:149` và `:341`. `findAll/findById` đã map an toàn nhưng hai hàm này thì không.

### USR-05 (High) Log plaintext password

```ts
// src/features/auth/auth.controller.ts:257
console.log(resetPasswordDto);
```

### USR-06 (High) reset-password không public

`auth.controller.ts:223` (`@Post('/reset-password')`) không có `@Public()`; ở gateway (`auth.controller.ts:224`) cũng vậy, trong khi `forgot-password`, `login`, `refresh` đều có. `JwtAuthGuard` toàn cục trả 401.

### USR-07 (High) Không thu hồi session

`resetPasswordService` chỉ cập nhật mật khẩu rồi xoá key reset (`auth.service.ts:262-268`); `changePasswordService` (`user.service.ts:303`) tương tự. `refreshTokens` chấp nhận token nếu bằng giá trị session đã lưu (`:308`) nên token cũ vẫn dùng được.

### USR-08 (High) Cascade delete

```ts
// src/database/schema.ts:43-44
parentId: uuid('parent_id').references((): AnyPgColumn => users.id, { onDelete: 'cascade' }),
tutorId: uuid('tutor_id').references((): AnyPgColumn => users.id, { onDelete: 'cascade' }),
```
Học sinh tạo qua `StudentService.create` luôn có `tutorId = currentUser.id` (`student.service.ts:146`), nên xoá tutor xoá sạch học sinh và phụ huynh của họ.

### USR-09 (High) Pre-hijack qua đăng ký không xác minh + OAuth gộp theo email

`registerService` tạo user luôn (`auth.service.ts:164-171`), không có bước xác minh. `findOrCreateOAuthUser` (`:121-125`) trả user cũ khi trùng email, không kiểm tra provider đã xác minh email, không lưu `googleId`.

## Vấn đề tích hợp

1. **Gateway `/users/*` thiếu `@Roles`** (USR-01) trong khi service này dựa vào gateway để phân quyền; RPC handler tin payload hoàn toàn.
2. **Gateway `/students/*` ánh xạ sang pattern `user.*` không khớp hợp đồng** (`gateway/src/features/student/student.controller.ts`):
   - `POST /students` -> `user.createUser` với payload `{userId, studentName, parentName, ...}` nhưng `createUserService` cần `email/firstName/lastName/password`: `firstName`/`lastName` undefined, `getUserByField({field:'email', value: undefined})` có thể ném lỗi hoặc tạo user sai. `StudentService` (tạo parent, userCode...) không bao giờ được gọi vì không có `@MessagePattern('student.*')`.
   - `PUT /students/:id` -> `user.updateUser { userId: <id trong URL>, ...dto }`: pattern này vốn là "tự cập nhật hồ sơ". Hậu quả: bất kỳ user đăng nhập nào sửa được hồ sơ người khác (IDOR), không có `role` nên bỏ qua kiểm tra STUDENT; field `studentName`... không thuộc `UpdateUserDto`.
   - `DELETE /students/:id` -> `user.deleteUserByAdmin` mà không có role guard: xoá bất kỳ user (kể cả admin).
   - `GET /students/get-student-code` -> `user.getUserByField` với `{}`: luôn lỗi `Unsupported field: undefined`.
3. **CLAUDE.md lỗi thời**: nói `auth/user/admin/student` đều có `@MessagePattern`; thực tế chỉ `auth.*`, `user.*` (+ `kafka.*`, `health.postgres`). Gateway admin cũng dùng `user.*` nên `AdminService` (lowercase email, kiểm tra trùng username/userCode, ràng buộc role TUTOR/STUDENT) không được gọi qua gateway: `PUT /admin/tutors/:id` -> `user.updateUserByAdmin` sửa được cả user không phải tutor.
4. **Tài liệu `auth-flows-rmq.md` lệch với code**: forgot-password trả `{ok:true}` thay vì `400 USER_NOT_FOUND`; lỗi đăng nhập là `INVALID_CREDENTIALS` (400); logout chưa nối dây.
5. **OAuth callback**: `facebookAuthCallback` đọc `GOOGLE_OAUTH_REDIRECT_URL` (`auth.controller.ts:331`); token nằm trên query string (lộ qua history/referrer/log).
6. **Biến môi trường**: `FACEBOOK_APP_ID/SECRET`, `BACKEND_URL`, `POSTGRES_*` không có trong bảng env của CLAUDE.md; secret JWT phải trùng gateway nhưng fallback khác nhau (`dev-insecure-jwt-secret` trong config vs `dev-insecure-secret` trong strategy).
7. **Hợp đồng third-service**: `redis.get` trả `string | null` (khớp), `redis.set` nhận `ttlSeconds` (khớp), `redis.del` là `@EventPattern` (khớp với `emit`). `email.sendForgotPasswordMail` chưa kiểm tra.

## Ghi chú / Cần xác minh

- **USR-03**: mức độ lộ phụ thuộc việc gateway có chuyển tiếp `message` lỗi 500 cho client không và định dạng message Drizzle 0.45 (`Failed query` + `params`); cần chạy thực tế.
- **USR-24**: lỗi boot khi thiếu `FACEBOOK_APP_ID` dựa trên hành vi `passport-oauth2`; chưa chạy để xác nhận.
- **USR-30**: mặc định `noAck` của Nest RMQ nên xác minh với version 11.1.27.
- Gateway có kiểm tra `isActive` khi verify access token hay không: chưa xem (liên quan USR-07). `JwtAuthGuard` của HTTP app trong service này có kiểm DB mỗi request.
- Role nằm trong JWT nên hạ quyền admin chỉ có hiệu lực khi token hết hạn (3h).
- Chưa xem: `test/`, `docker-compose.yml`, `Dockerfile`, seed `seed-curriculum-demo/seed-dashboard/seed-edu-flow`, swagger data, i18n.
- Service này không có rate limit (decorator `Throttle` không có guard tương ứng): brute force login/user-code/forgot-password chỉ có thể được chặn ở gateway (chưa kiểm tra).
