# Báo cáo review tĩnh: service `user` (D:\projects\user\src)

Phạm vi: review tĩnh (chỉ đọc code, không build/test, không sửa file nguồn). Bỏ qua `node_modules`, `dist`.
Chỉ ghi các lỗi đã xác minh bằng cách đọc code. Mục "ghi chú" ở cuối là điểm chưa chắc chắn, không tính vào thống kê.

## Thống kê theo mức độ

| Mức độ   | Số lỗi |
| -------- | ------ |
| Critical | 0      |
| High     | 5      |
| Medium   | 17     |
| Low      | 15     |
| **Tổng** | **37** |

---

## HIGH

### US-01 (High) - Đăng nhập OAuth tự liên kết vào tài khoản STUDENT sẵn có theo email chưa xác minh (pre-hijack)
- File: `features/auth/auth.service.ts:125-134`; `packages/strategy/google.strategy.ts:29-32`; `packages/strategy/facebook.strategy.ts:31-34`; `features/auth/auth.service.ts:152-180` (register không xác minh email)
- Mô tả: `findOrCreateOAuthUser` thấy email trùng và role STUDENT thì trả luôn tài khoản đó, không kiểm tra email do Google/Facebook xác minh (strategy lấy `emails[0].value` mà không xem cờ `verified`), cũng không lưu `googleId/facebookId`. `POST /auth/register` và `PUT /users` (đổi email) không cần xác minh email. Kẻ tấn công đăng ký sẵn bằng email của nạn nhân (đặt mật khẩu của hắn). Khi nạn nhân đăng nhập Google/Facebook, họ vào đúng tài khoản đó, còn kẻ tấn công vẫn giữ mật khẩu. Facebook còn cho phép email chưa xác minh, nên có thể chiếm tài khoản STUDENT đã có.
- Cách sửa: chỉ liên kết khi provider báo email đã xác minh (`profile.emails[0].verified`, hoặc `_json.email_verified`). Lưu `googleId/facebookId` và tìm theo các trường này trước. Thêm bước xác minh email khi register và khi đổi email. Nếu tài khoản cũ chưa xác minh thì không auto-link.

### US-02 (High) - IDOR: TUTOR đọc được thông tin mọi học sinh và phụ huynh
- File: `features/student/student.controller.ts:44,164-231`; `features/student/student.service.ts:219-269`
- Mô tả: controller cho phép `ADMIN` và `TUTOR`, nhưng `GET /students/:id` chỉ kiểm tra học sinh tồn tại, không kiểm tra `student.tutorId === currentUser.id`. Mọi tutor đọc được học sinh của tutor khác, gồm email, SĐT, địa chỉ, thông tin phụ huynh (email, SĐT, địa chỉ). `UserService.getDetailUserService` đã có quy tắc "tutor chỉ đọc học sinh của mình" nhưng route này không dùng nó.
- Cách sửa: truyền `currentUser` vào `findById`. Nếu role là TUTOR thì bắt buộc `user.tutorId === currentUser.id`, ngược lại trả 403/404. Hoặc dùng `getDetailUserService` với actor.

### US-03 (High) - Tạo phụ huynh không có email lưu `email = ''` làm vi phạm unique, học sinh thứ hai trở đi lỗi 500
- File: `features/student/student.service.ts:136` (`dto.parentEmail || ''`) và `:330,335` (`dto.parentEmail ?? ''`); `database/schema.ts:21` (`email` unique + notNull)
- Mô tả: `parentEmail` là optional. Khi có `parentName` mà không có email, hệ thống chèn parent với email rỗng. Parent đầu tiên chèn được, từ parent thứ hai (ở bất kỳ học sinh nào) vi phạm unique `users_email_unique`, trả 23505. `ErrorInterceptor` biến lỗi này thành 500 "Record already exists". Ngoài ra học sinh đã tạo trước đó (nếu parent tạo trước) có thể mất dữ liệu (xem US-15).
- Cách sửa: sinh email placeholder duy nhất như học sinh (`${parentUsername}@no-email.local`), hoặc cho phép `email` nullable ở schema. Kiểm tra trùng email trước khi chèn và trả 409.

### US-04 (High) - Log HTTP ghi mật khẩu hiện tại và reset token dạng rõ
- File: `packages/interceptor/logger.interceptor.ts:5-13,53-55,60-62`
- Mô tả: `SENSITIVE_KEYS` thiếu `currentPassword` và `jti` (reset token), trong khi `trace-context.interceptor.ts:20-33` đã có. `POST /users/change-password` ghi `currentPassword` thật vào log. `POST /auth/reset-password` ghi `jti`, có hiệu lực 5 phút để đặt lại mật khẩu của bất kỳ ai. Danh sách bị lệch giữa hai interceptor.
- Cách sửa: dùng chung một danh sách (thêm `currentPassword`, `jti`, `resetToken`, `authorization`, `secret`). Tốt hơn là redact theo regex (`/pass|token|secret|jti|authorization/i`).

### US-05 (High) - Secret JWT rơi về giá trị cứng khi thiếu biến môi trường
- File: `packages/configs/jwt-sign.config.ts:17-21`; `packages/strategy/jwt-user.strategy.ts:10`
- Mô tả: nếu không đặt `JWT_ACCESS_SECRET`/`JWT_SECRET`, service ký token bằng `'dev-insecure-jwt-secret'` (chuỗi biết trước) mà không lỗi. `JWT_REFRESH_SECRET` thiếu thì dùng luôn secret access. Cấu hình sai trên production làm ai cũng giả mạo được token, kể cả ADMIN. Ngoài ra `JwtAuthGuard` (`jwt-auth.guard.ts:86-91`) không có fallback này nên hai nơi lệch cấu hình.
- Cách sửa: không fallback; ném lỗi khi khởi động nếu thiếu secret (dùng `validateRequiredEnvs`). Yêu cầu refresh secret khác access secret.

---

## MEDIUM

### US-06 (Medium) - Reset token không dùng một lần thật sự (replay / race)
- File: `features/auth/auth.service.ts:260-280`
- Mô tả: luồng là `redis.get` rồi đổi mật khẩu rồi `redis.del` bằng fire-and-forget. Hai request song song cùng token đều qua bước get. Nếu `redis.del` lỗi (chỉ log warn) thì token vẫn dùng lại được đến hết TTL 5 phút.
- Cách sửa: dùng thao tác nguyên tử lấy-và-xóa (GETDEL / Lua) ở third-service, và `await` việc xóa trước khi đổi mật khẩu.

### US-07 (Medium) - Access và refresh token đặt trên query string của URL redirect
- File: `features/auth/auth.controller.ts:293-297,333-337`
- Mô tả: token nằm trong URL nên lộ qua lịch sử trình duyệt, log proxy/CDN, header Referer. Refresh token sống 7 ngày. Callback cũng không có tham số `state` (CSRF/login-CSRF).
- Cách sửa: dùng fragment (`#`), hoặc cấp mã một lần (code) rồi frontend đổi lấy token qua POST. Bật `state` cho passport.

### US-08 (Medium) - Kiểm tra phiên refresh "fail open" khi Redis/RMQ lỗi
- File: `features/auth/auth.service.ts:307-320`
- Mô tả: nếu `redis.get` lỗi thì bỏ qua kiểm tra và cấp token mới. Refresh token đã bị thu hồi (logout, đổi mật khẩu, khóa tài khoản) dùng lại được trong lúc Redis sự cố. `send` còn retry 3 lần x 10s nên request treo tới ~30s mới fail open.
- Cách sửa: fail closed (trả 503/401) với luồng refresh, hoặc ít nhất kiểm tra `isActive` và dấu thời gian đổi mật khẩu trong DB.

### US-09 (Medium) - Rotation refresh token không nguyên tử; đăng nhập thiết bị mới đá văng thiết bị cũ
- File: `features/auth/auth.service.ts:72-82,106,317-333`
- Mô tả: (a) `emitLoginSessionCreated` là fire-and-forget, nên hai refresh đồng thời với cùng token đều qua `assertRefreshSessionActive`, đều nhận cặp token mới (không phát hiện reuse). (b) Nếu `redis.set` thất bại thì user nhận token nhưng lần refresh sau luôn bị 401. (c) Khóa chỉ là `session:{userId}` (1 phiên/người dùng), nên đăng nhập ở thiết bị B làm refresh token của thiết bị A không dùng được.
- Cách sửa: khóa phiên theo `userId + jti/deviceId`, thêm `jti` vào refresh token, dùng compare-and-set nguyên tử, `await` lưu phiên trước khi trả token.

### US-10 (Medium) - Quyền (role) lấy từ JWT, không đối chiếu DB; đổi role không thu hồi phiên
- File: `packages/guards/jwt-auth.guard.ts:54,105-113`; `features/user/user.service.ts:275-288,436-467`
- Mô tả: guard truy vấn DB nhưng chỉ kiểm tra `isActive`, vẫn tin `role` trong token (sống 3 giờ). Khi admin hạ quyền một ADMIN/TUTOR qua `PUT /users/:id`, người đó giữ quyền cũ tới khi token hết hạn; session cũng không bị thu hồi.
- Cách sửa: đọc `role` từ DB trong guard (đã có query sẵn) và gán `request.user.role` theo DB; thu hồi phiên khi role đổi.

### US-11 (Medium) - `PUT /users/:id` bỏ qua các ràng buộc "admin cuối cùng", tự khóa, thu hồi phiên
- File: `features/user/user.service.ts:275-288,436-467` (so sánh với `:320-339,342-370`)
- Mô tả: `updateUserService` cho đổi `isActive` và `role` nhưng không gọi `assertNotLastActiveAdmin`, không chặn tự đổi mình (`actor.id === id`), không `revokeLoginSession` khi `isActive=false`. Có thể hạ quyền/khóa admin cuối cùng làm hệ thống mất admin, trong khi các hàm toggle/delete đã chặn.
- Cách sửa: trong `applyUserUpdate`, nếu `data.isActive === false` hoặc `data.role` đổi khỏi ADMIN thì áp dụng cùng kiểm tra last-admin/self; thu hồi phiên khi vô hiệu hóa.

### US-12 (Medium) - Email phân biệt hoa thường và không chuẩn hóa, không nhất quán giữa các luồng
- File: `features/auth/auth.service.ts:155-157,201-204`; `features/user/user.service.ts:198,454-456`; `features/admin/admin.service.ts:100,159`; `packages/entities/auth/auth.schema.ts:29-32`
- Mô tả: admin luôn `trim().toLowerCase()` email, còn register/createUser/update/login dùng email nguyên bản và so sánh `eq` phân biệt hoa thường. Hậu quả: `A@x.com` và `a@x.com` thành hai tài khoản; tài khoản do admin tạo (đã lowercase) không đăng nhập được khi gõ `Foo@x.com`; OAuth (Google trả chữ thường) tạo trùng tài khoản.
- Cách sửa: chuẩn hóa `trim().toLowerCase()` trong schema Zod (`emailFieldSchema`, createUser, updateUser) và ở mọi lookup, hoặc dùng cột `citext`.

### US-13 (Medium) - Schema login áp quy tắc độ phức tạp mật khẩu, trong khi nhiều luồng tạo mật khẩu bỏ qua kiểm tra này
- File: `packages/entities/auth/auth.schema.ts:34-51,70-73`; `packages/entities/user/user.schema.ts:232-235,273-275`; `packages/entities/admin/admin.schema.ts:12-14,67-70`
- Mô tả: `createUserSchema` (min 6, max 20) chỉ kiểm tra độ phức tạp nếu độ dài 8-100; `createManagedUserSchema` (min 6, max 20) chỉ kiểm tra nếu 8-14. Mật khẩu 6-7 ký tự (cả 15-20 ở luồng admin) lọt qua mà không cần hoa/số/ký tự đặc biệt. Ngược lại `loginSchema` dùng `passwordFieldSchema` bắt buộc phức tạp, nên user có mật khẩu yếu đó không đăng nhập được (422) và còn lộ chính sách mật khẩu. Swagger admin ghi 8-14 nhưng schema cho 6-20.
- Cách sửa: dùng một `passwordFieldSchema` duy nhất cho mọi nơi tạo/đổi mật khẩu; `loginSchema` chỉ `z.string().min(1)` (không áp phức tạp khi đăng nhập). Bỏ điều kiện bỏ qua theo độ dài.

### US-14 (Medium) - `changePassword` giới hạn tối đa 14 ký tự, lệch với register/reset (25)
- File: `packages/entities/user/user.schema.ts:58-61`
- Mô tả: mật khẩu 15-25 ký tự hợp lệ ở register/reset/login nhưng đổi mật khẩu thì bị từ chối; user có thể đặt mật khẩu mới ngắn hơn chính sách. Không kiểm tra mật khẩu mới khác mật khẩu cũ (`user.service.ts:373-386`).
- Cách sửa: dùng chung `passwordFieldSchema`; thêm kiểm tra `newPassword !== currentPassword`.

### US-15 (Medium) - Tạo học sinh/phụ huynh không nằm trong transaction, để lại dữ liệu mồ côi
- File: `features/student/student.service.ts:134-166`, `:325-359`
- Mô tả: parent được chèn trước, rồi student. Nếu chèn student lỗi (email `dto.email` trùng, username race, userCode quá dài, v.v.) thì parent đã tạo vẫn còn (mồ côi, gắn `tutorId`). Tương tự ở `update`: tạo parent xong mới `repo.update` gắn `parentId`. `dto.email` của học sinh cũng không kiểm tra trùng trước nên lỗi 500.
- Cách sửa: bọc trong `db.transaction`; pre-check email/userCode/username và trả 409.

### US-16 (Medium) - `userCode` không có ràng buộc unique, nhiều đường ghi không kiểm tra trùng; đăng nhập bằng userCode có thể chọn sai tài khoản
- File: `database/schema.ts:31`; `features/user/user.service.ts:216-223,436-467`; `features/auth/auth.service.ts:211-221`; `features/admin/admin.service.ts:71-78`
- Mô tả: cột `userCode` không unique. `applyUserUpdate` (PUT /users, PUT /users/:id) cho đặt `userCode` tùy ý mà không kiểm tra trùng; vòng sinh mã ở `createUserService` hết 5 lần vẫn dùng mã trùng cuối cùng (`:218-223`); `updateStudent` bỏ qua kiểm tra khi `userCode` là chuỗi rỗng (falsy) và so sánh bản đã `trim()` nhưng ghi bản chưa trim. `loginByUserCodeService` chỉ lấy bản ghi đầu khớp role (`rows.find`), nên trùng mã thì đăng nhập vào/so mật khẩu với sai tài khoản.
- Cách sửa: thêm unique index (hoặc unique theo (userCode, role)); kiểm tra và trim ở mọi đường ghi; ném lỗi khi hết số lần sinh mã; chuẩn hóa chữ hoa.

### US-17 (Medium) - Độ dài đầu vào vượt giới hạn cột DB, dẫn tới lỗi 500
- File: `packages/entities/student/student.schema.ts:9` (userCode max 50, cột `varchar(6)`, `database/schema.ts:31`); `packages/entities/user/user.schema.ts:216-221` (username max 100, cột `varchar(50)`, `database/schema.ts:22`); `features/user/user.service.ts:89-93`, `features/admin/admin.service.ts:259-263`, `features/student/student.service.ts:78-83` (username tự sinh từ firstName+lastName tối đa 200-510 ký tự, không cắt); `packages/entities/admin/admin.schema.ts:75-78` (subjects tối đa 20 phần tử join vào `varchar(255)`); `packages/entities/user/user.schema.ts:128,181` (email không giới hạn 255; subjects max 30 nhưng thông báo ghi "Province")
- Mô tả: Postgres báo 22001 (value too long) và `ErrorInterceptor` biến thành 500.
- Cách sửa: đồng bộ max của Zod với độ dài cột; cắt username tự sinh còn tối đa 50 ký tự (cộng hậu tố số).

### US-18 (Medium) - Cập nhật email phụ huynh thiếu kiểm tra trùng và có thể ghi đè danh tính đăng nhập
- File: `features/student/student.service.ts:315-323`
- Mô tả: `parentUpdate.email = dto.parentEmail` ghi thẳng, không kiểm tra trùng với user khác (lỗi 23505 thành 500), không chuẩn hóa chữ thường, và hợp lệ với giá trị rỗng. Email là định danh đăng nhập/OAuth/reset mật khẩu nên đổi mà không kiểm tra là rủi ro.
- Cách sửa: dùng chung hàm kiểm tra email duy nhất như `applyUserUpdate`/`AdminService.updateManagedUser`.

### US-19 (Medium) - `createUserService` bỏ qua phần lớn trường trong `createUserSchema`
- File: `features/user/user.service.ts:194-247`
- Mô tả: `userRepo.create` chỉ nhận `id,userCode,email,username,firstName,lastName,password,role`. Các trường đã validate: `isActive`, `phone`, `avatar`, `gender`, `dateOfBirth`, `school`, `subjects`, `parentId`, `tutorId`, `gradesId`, `description`... bị bỏ mất âm thầm. Ví dụ `POST /users` với `isActive:false` vẫn tạo tài khoản đang hoạt động. Không tạo `userCode` cho STUDENT/PARENT nên không dùng được đăng nhập bằng userCode (`auth.schema.ts:75-82` chỉ cho PARENT/STUDENT).
- Cách sửa: map đầy đủ các trường (kiểm tra FK parent/tutor/grades), hoặc loại các trường không hỗ trợ khỏi schema. Sinh `userCode` cho STUDENT/PARENT.

### US-20 (Medium) - Producer RMQ retry mọi loại lỗi, kể cả lỗi nghiệp vụ và thao tác không idempotent
- File: `features/rabbitmq/rmq.producer.ts:114-183`
- Mô tả: mọi exception (400/404/409 từ responder) đều được thử lại 3 lần với backoff. Lỗi nghiệp vụ nhận 3 lần xử lý/ghi log; request timeout (nhưng responder đã chạy) gửi lặp, ví dụ `email.sendForgotPasswordMail` gửi trùng email.
- Cách sửa: chỉ retry khi lỗi hạ tầng (TimeoutError, lỗi kết nối); không retry lỗi có `statusCode < 500`; cho tham số `maxRetries=0` với thao tác không idempotent.

### US-21 (Medium) - Không có rate limit / chống brute-force cho login, userCode login, forgot/reset password
- File: `packages/decorators/throttle.decorator.ts` (chỉ `SetMetadata`, không có guard nào đọc `THROTTLE_KEY`); `app.module.ts:32-42`; `features/auth/auth.controller.ts`
- Mô tả: decorator `@Throttle` tồn tại nhưng không được dùng và không có `ThrottlerGuard`. Mã `userCode` chỉ 6 ký tự (36^6) và mật khẩu có thể dò vô hạn; forgot-password gửi email không giới hạn. (Nếu gateway đã chặn thì endpoint HTTP của service này vẫn mở khi truy cập trực tiếp.)
- Cách sửa: cài `@nestjs/throttler` và áp theo IP + định danh tài khoản; khóa tạm sau N lần sai.

### US-22 (Medium) - Health check tải toàn bộ bảng `users` vào bộ nhớ và endpoint HTTP gốc yêu cầu JWT
- File: `app.controller.ts:105-152` (`this.db.query.users.findMany()` rồi filter trong JS; hàng chứa cả hash mật khẩu), `:18-27` (`GET /` không có `@Public()`)
- Mô tả: health RPC chạy `findMany()` không giới hạn rồi đếm trong JS: tốn bộ nhớ/thời gian tăng theo số user, và `fetchData` trả mẫu 5 user (PII) cho bất kỳ ai gọi pattern này. `GET /` bị `JwtAuthGuard` toàn cục chặn nên liveness probe nhận 401.
- Cách sửa: dùng `SELECT 1` và `count() ... GROUP BY role`; bỏ `sampleUsers`; thêm `@Public()` cho health HTTP.

---

## LOW

### US-23 (Low) - CORS phản chiếu mọi origin kèm credentials
- File: `main.ts:61`
- Mô tả: `origin: true, credentials: true`. Hiện dùng Bearer nên rủi ro thấp, nhưng nếu sau này dùng cookie sẽ thành lỗ hổng CSRF/đọc dữ liệu chéo origin.
- Cách sửa: whitelist origin theo biến môi trường.

### US-24 (Low) - Callback Facebook dùng biến môi trường của Google
- File: `features/auth/auth.controller.ts:331-333`
- Mô tả: đọc `GOOGLE_OAUTH_REDIRECT_URL` cho luồng Facebook; không thể cấu hình redirect riêng.
- Cách sửa: dùng `FACEBOOK_OAUTH_REDIRECT_URL` (fallback sang giá trị chung).

### US-25 (Low) - Strategy OAuth cấu hình thiếu an toàn
- File: `packages/strategy/facebook.strategy.ts:18-19` (`config.get(...)!`); `packages/strategy/google.strategy.ts:18-21`
- Mô tả: thiếu `FACEBOOK_APP_ID/SECRET` thì passport ném lỗi lúc khởi tạo module và cả service không lên; Google lại fallback sang client id/secret giả. `facebook.strategy.ts:24` không yêu cầu field `name` nên `givenName/familyName` luôn rỗng, luôn dùng `displayName` và `lastName='User'`. `validate` ném `Error` thường (thành 500) khi thiếu email thay vì 401/400.
- Cách sửa: kiểm tra env lúc bootstrap một cách thống nhất; thêm `name` vào `profileFields`; ném `UnauthorizedException`.

### US-26 (Low) - `googleId`, `facebookId`, `avatar` từ OAuth không được lưu
- File: `features/auth/auth.service.ts:120-148`
- Mô tả: `findOrCreateOAuthUser` chỉ nhận `email/firstName/lastName`, bỏ `googleId`/`facebookId`/`avatar` từ profile. Hệ quả: không có liên kết ổn định theo ID provider (liên quan US-01), user OAuth mới không có avatar.
- Cách sửa: lưu các trường này và tra cứu theo ID provider trước.

### US-27 (Low) - `forgot-password` có thể lộ email tồn tại qua lỗi/thời gian phản hồi
- File: `features/auth/auth.service.ts:237-258`
- Mô tả: email không tồn tại trả ngay `{ ok: true }`; email tồn tại phải đợi 2 lần gọi RMQ và nếu Redis/mail lỗi trả 5xx. Khác biệt về thời gian/kết quả cho phép dò email. `registerService` còn trả thẳng `EMAIL_EXISTS` (`:155-161`).
- Cách sửa: xử lý bất đồng bộ (đẩy việc gửi mail vào hàng đợi) và luôn trả cùng phản hồi.

### US-28 (Low) - Tìm kiếm `ILIKE` không escape ký tự đại diện `%` và `_`
- File: `features/user/user.repository.ts:54`; `features/admin/admin.repository.ts:157`; `packages/helpers/queryList.helper.ts:43`
- Mô tả: người dùng nhập `%` hoặc `_` khớp mọi thứ, kết quả sai và có thể gây quét bảng chậm.
- Cách sửa: escape `\`, `%`, `_` trong chuỗi tìm kiếm.

### US-29 (Low) - `gradesId` không được xác thực tồn tại
- File: `packages/entities/user/user.schema.ts:204`; `features/user/user.service.ts:436-467`; `features/user/user.repository.ts:177-179` (`validateGradeIds` không được gọi ở đâu)
- Mô tả: cột `grades_id uuid[]` không có FK, `updateUser` nhận mọi UUID nên có thể lưu ID khối lớp không tồn tại; `findGradesByUser` sau đó bỏ qua im lặng.
- Cách sửa: gọi `validateGradeIds` và so sánh số lượng trước khi cập nhật.

### US-30 (Low) - Ràng buộc unique chỉ kiểm tra trước (TOCTOU), thua race trả 500 thay vì 409
- File: `features/auth/auth.service.ts:155-180`; `features/user/user.service.ts:198-210,453-461`; `features/admin/admin.service.ts:100-108`; `packages/interceptor/error.interceptor.ts:19-26`
- Mô tả: kiểm tra email/username rồi mới insert, hai request song song cùng thua ràng buộc DB. `ErrorInterceptor` dịch 23505 nhưng vẫn ném `InternalServerErrorException` (500) thay vì 409.
- Cách sửa: bắt 23505 và trả `ConflictException` (409); hoặc dựa vào ràng buộc DB.

### US-31 (Low) - Rò rỉ thông tin lỗi và stack trace
- File: `packages/interceptor/error.interceptor.ts:32-33`; `packages/filters/http-exception.filter.ts:63`
- Mô tả: với lỗi không phải HttpException không phải pg, `error.message` gốc được trả cho client (có thể chứa chi tiết nội bộ); filter trả `trace: exception.stack` khi `NODE_ENV !== 'production'` nên nếu quên đặt `NODE_ENV` thì lộ stack ở production.
- Cách sửa: luôn trả thông báo chung cho lỗi không xác định; chỉ bật `trace` khi `NODE_ENV === 'development'` rõ ràng.

### US-32 (Low) - Hàm thu hồi phiên được `await`, lỗi Redis làm hỏng thao tác đã hoàn tất
- File: `features/user/user.service.ts:253-269,367-368,400-403`; `features/admin/admin.service.ts:190,208,213-215`
- Mô tả: mật khẩu đã đổi hoặc user đã bị xóa/khóa, rồi `redis.del` lỗi thì request trả 5xx dù DB đã thay đổi. Với reset password, user thử lại sẽ thấy token vẫn còn trong Redis (xem US-06).
- Cách sửa: thực hiện thu hồi bằng cách thử lại có kiểm soát/outbox, hoặc báo thành công kèm cảnh báo; tối thiểu không báo lỗi sau khi commit.

### US-33 (Low) - Xóa học sinh qua `/students/:id` không thu hồi phiên và không kiểm tra liên kết
- File: `features/student/student.service.ts:365-371`; `features/student/student.repository.ts:90-96`
- Mô tả: khác `AdminService.deleteManagedUser`, không gọi `revokeLoginSession`, không kiểm tra `countLinkedUsers` (một số người dùng `parentId` trỏ vào user được xóa sẽ cascade). `repo.update/updateParent` cũng không cập nhật `updatedAt` (`student.repository.ts:72-88`).
- Cách sửa: tái sử dụng logic của `AdminService`/`UserService`; thêm `updatedAt: new Date()`.

### US-34 (Low) - Học sinh do ADMIN tạo bị gán `tutorId` là ID của admin
- File: `features/student/student.service.ts:145,165`; `features/user/user.service.ts:416-420`
- Mô tả: `tutorId: currentUser.id` kể cả khi người tạo là ADMIN, trái với `assertLinkTarget` (tutorId phải có role TUTOR). Do FK cascade, `assertNoLinkedAccounts` sẽ chặn xóa chính admin đó, và học sinh xuất hiện trong bộ lọc của "tutor" sai.
- Cách sửa: chỉ gán `tutorId` khi người tạo là TUTOR (hoặc yêu cầu truyền tutorId hợp lệ khi là ADMIN).

### US-35 (Low) - Suy luận giới tính phụ huynh và tách tên không chính xác
- File: `features/student/student.service.ts:68-74,144,343`
- Mô tả: `GUARDIAN` bị gán `FEMALE` (chỉ `FATHER` -> `MALE`); cập nhật `parentRelationship` không cập nhật `gender`. `splitName` tách tên theo khoảng trắng đầu tiên (họ làm `firstName`), trong khi username sinh `lastName+firstName` ngược quy ước; tên có khoảng trắng đầu/cuối cho `firstName` rỗng; nếu tên toàn ký tự không phải a-z0-9 (vd. toàn chữ `Đ` hoặc ký tự phi Latin) thì username rỗng (`:78-83`).
- Cách sửa: `gender` để null khi GUARDIAN, `trim()` tên, và có đường dự phòng cho username rỗng (`user_<random>`).

### US-36 (Low) - Handler RPC không tự kiểm tra quyền/xác thực đầu vào cho một số pattern
- File: `features/user/user.rpc.controller.ts:40-63`; `features/user/user.service.ts:107,194,168`
- Mô tả: `user.getUsers`, `user.getUserByField`, `user.createUser`, `user.changePassword` không có actor/`assertAdmin` trong service (HTTP chỉ chặn ở controller bằng `@Roles`), và không handler RPC nào dùng `ZodValidationPipe`. `user.createUser` nhận `role: 'ADMIN'` từ payload. Hiện gateway có chặn bằng `@Roles('ADMIN')`, nhưng bất kỳ producer nào truy cập được `user_queue` đều tạo được ADMIN hoặc đọc toàn bộ user. Comment ở `user.rpc.controller.ts:30-35` khẳng định quyền được kiểm trong service, không đúng với các hàm này.
- Cách sửa: thêm `actor` và `assertAdmin` cho các hàm này, validate payload RPC bằng Zod, và hạn chế quyền publish vào `user_queue`.

### US-37 (Low) - Handler debug/thử nghiệm còn sót lại
- File: `app.controller.ts:29-103`
- Mô tả: `kafka.emit`, `kafka.ping`, `kafka.user.error`, `kafka.user`, `kafka.send` còn trong production. `kafka.user` chuyển tiếp payload tùy ý sang tutor-service; `kafka.send` trả `userId: 'generated-uuid-...'` giả; tất cả log nguyên payload (`JSON.stringify(data)`) không redact.
- Cách sửa: xóa hoặc đặt sau cờ môi trường dev; không log payload nguyên văn.

---

## Ghi chú (không tính vào thống kê, chưa xác minh được bằng đọc tĩnh)
- `JwtAuthGuard` và `LanguageGuard` được đăng ký bằng `APP_GUARD` trong ứng dụng hybrid (HTTP + RMQ). Nếu Nest áp chúng cho handler RPC thì `request.headers` sẽ `undefined`; cần kiểm tra khi chạy thực tế (CLAUDE.md nói RPC đang hoạt động, nên có thể đã ổn).
- Contract giữa gateway và user: `gateway/src/features/student/student.controller.ts:132` gửi body học sinh (`studentName`, ...) tới `user.createUser`, vốn mong đợi `email/firstName/lastName/password`; service `user` không có handler RPC cho `admin.*`/`student.*`. Cần xác nhận phía gateway.
