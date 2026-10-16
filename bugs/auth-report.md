# Auth review report

- Phạm vi: luồng auth từ UI → gateway → user (auth/user/admin) → tutor / third (identity, email, upload, redis).
- Phương pháp: 4 sub agent đọc code, **chỉ đọc, không sửa, không chạy test**. Mọi mục là "đã đọc code", chưa tái hiện bằng test trừ khi ghi rõ.
- Thư mục thực tế của repo: `ui/`, `gateway/`, `user/`, `tutor/`, `third/` (CLAUDE.md ghi `USER/`, `THIRD_SERVICE/`, `TUTOR-UI/` là tên cũ).
- Báo cáo này nằm trong `gateway/bugs/`. Mỗi bug được xếp vào thư mục chứa đoạn code cần sửa. Bug liên quan nhiều repo được ghi ở repo chính và tham chiếu chéo.

Mức độ: **High** = chiếm tài khoản / leo quyền / bypass xác thực. **Medium** = lộ thông tin, fail-open, thiếu giới hạn. **Low** = phòng thủ chiều sâu, không nhất quán.

---

## 1. `user/` (auth / user / admin service)

### H-USER-1 (High) Chiếm tài khoản trước qua OAuth gộp theo email chưa xác minh
- `src/features/auth/auth.service.ts:120-149` (`findOrCreateOAuthUser`): tìm user theo email, nếu là STUDENT thì trả luôn, không kiểm tra email đã được chủ tài khoản xác minh, không lưu `googleId`/`facebookId`.
- `src/features/auth/auth.service.ts:152-197` (`registerService`): đăng ký không xác minh quyền sở hữu email (chỉ chặn trùng).
- `src/features/user/user.service.ts:44-52`: `SELF_UPDATE_RESTRICTED_FIELDS` không chặn `email`, nên `PUT /users` đổi email tùy ý.
- Kịch bản: kẻ tấn công đăng ký `victim@gmail.com` với mật khẩu của mình. Nạn nhân đăng nhập Google cùng email và rơi vào tài khoản của kẻ tấn công. Kẻ tấn công đọc dữ liệu nạn nhân nhập vào.
- Sửa: yêu cầu email đã xác minh trước khi gộp OAuth, xác minh email khi đăng ký, chặn đổi email qua `PUT /users`.
- Phía gateway (xem mục 2, H-GW-1) cũng cần kiểm tra `email_verified` của Facebook.

### H-USER-2 (High) RPC `user.createUser` không kiểm tra quyền, cho phép tạo ADMIN
- `src/features/user/user.rpc.controller.ts:60-63`: gọi thẳng `createUserService(dto)`, không có actor, không có `ZodValidationPipe`.
- `src/packages/entities/user/user.schema.ts:268` cho phép `role` (gồm ADMIN). `src/features/user/user.service.ts:214` dùng `createUserDto.role ?? 'STUDENT'`.
- Kịch bản: publisher nào trên `user_queue` gửi `{email, password, role:'ADMIN'}` đều tạo được admin. HTTP `POST /users` có `@Roles('ADMIN')` ở gateway, nhưng lớp service không kiểm tra.
- Mức: High nếu queue dùng chung với service khác, Medium nếu chỉ gateway publish được. **Cần xác minh ai publish được `user_queue`.**

### M-USER-1 (Medium) Tin tưởng actor trong payload RPC
- `src/features/user/user.rpc.controller.ts:22-27` (`splitActor`): `actorId`/`actorRole` lấy từ payload. Publisher gửi `actorRole:'ADMIN'` qua được `assertAdmin` (`user.service.ts:390-392`) cho `updateUserByAdmin`, `deleteUserByAdmin`, `updateStatusUser`.
- Các RPC (`auth.rpc.controller.ts`, `user.rpc.controller.ts`) không có Zod pipe, chỉ gateway validate.

### M-USER-2 (Medium) Lộ thông tin tài khoản
- `auth.service.ts:155-171`: đăng ký trả `EMAIL_EXISTS`/`USERNAME_EXISTS` rõ ràng.
- `user.service.ts:203-209`: thông báo lỗi có kèm email.
- `auth.service.ts:130-131`: OAuth vào tài khoản ADMIN/TUTOR/PARENT trả `OAUTH_ACCOUNT_NOT_LINKABLE`, lộ tài khoản nội bộ.
- `auth.service.ts:241-255` (`forgotPasswordService`): email không tồn tại trả ngay, email tồn tại thì 2 RMQ await + gửi mail. Chênh lệch thời gian và lỗi 500 chỉ với email thật.

### M-USER-3 (Medium) Thiếu rate limit và khóa tài khoản trong service
- User service không có throttle cho `login`, `login/user-code`, `forgot-password`, `reset-password`, `register`, `refresh`.
- Không có khóa theo tài khoản. `userCode` 6 ký tự brute-force được qua nhiều IP.
- Forgot-password không có cooldown theo tài khoản, spam email reset được.

### M-USER-4 (Medium) Thu hồi phiên fail-open
- `auth.service.ts:307-320` (`assertRefreshSessionActive`): lỗi `redis.get`/RMQ bị bỏ qua, refresh vẫn thành công. Logout/đổi mật khẩu không có hiệu lực khi Redis lỗi.
- `auth.service.ts:72-82` và `106`: ghi refresh mới là fire-and-forget. Nếu `redis.set` lỗi, token cũ vẫn là token được lưu, không có rotation thật.

### M-USER-5 (Medium) Token reset không chắc chắn dùng một lần
- `auth.service.ts:264-279`: `redis.get` → cập nhật mật khẩu → `emit('redis.del')` không await. Hai request đồng thời cùng `jti` đều thành công.

### M-USER-6 (Medium, cần xác minh hạ tầng) HTTP port của USER có thể public
- `src/main.ts:61`: `enableCors({ origin: true, credentials: true })`. `src/main.ts:93`: `app.listen(port)`, app hybrid có HTTP.
- `src/features/auth/auth.controller.ts:273-276, 314-316`: callback Google/Facebook không kiểm tra `state` (gateway có `oauth-state.guard.ts`).
- USER không có `ThrottlerModule`. Nếu port này public thì toàn bộ bảo vệ của gateway (throttle, state, guard) bị bypass. **Nếu public, nâng lên High.**
- `jwt-auth.guard.ts:105-113` cũng chỉ kiểm tra `isActive` trong DB, không kiểm tra `session:{id}`, nên access token sống 3h sau logout.

### L-USER-1 (Low) Fallback secret
- `src/packages/configs/jwt-sign.config.ts:17-21`: fallback `'dev-insecure-jwt-secret'`, refresh secret rơi về access secret, không fail-fast. Gateway fail-fast nên không nhất quán.
- `src/packages/strategy/jwt-user.strategy.ts:10`: fallback `'dev-insecure-secret'` (strategy này không đăng ký ở module nào).

### L-USER-2 (Low) Chuẩn hóa email không nhất quán
- `auth.service.ts:152-161, 200-208, 237-240` không lowercase. `admin.service.ts:99-100` có lowercase. Có thể tạo hai tài khoản cho cùng một người, OAuth không khớp.

### L-USER-3 (Low) Chính sách mật khẩu không thống nhất
- register/login/reset: min 6, max 25 (`auth.schema.ts:34-51`).
- createUser: field 6-20 nhưng refine 8-100 (`user.schema.ts:232-236, 268-303`).
- changePassword: 8-14 (`user.schema.ts:55-63`). Admin: 8-14.

### L-USER-4 (Low) Đổi role không thu hồi phiên, không có kiểm tra admin cuối cùng
- `user.service.ts:435-467`: access token giữ role cũ tới 3h (`roles.guard.ts:24` tin claim).
- `user.service.ts:275-288, 435-467`: admin duy nhất có thể tự hạ quyền, khóa hệ thống.

### L-USER-5 (Low) Race khi tạo user trùng email
- `createUserService` TOCTOU. DB có unique nên chỉ là lỗi 500, không phải lỗ hổng.

### L-USER-6 (Low) Refresh so sánh không constant-time
- `auth.service.ts:317`. Không khai thác thực tế được, ghi nhận cho đủ.

---

## 2. `gateway/` (HTTP edge, JWT guard, auth controller, OAuth strategy)

### H-GW-1 (High) Chiếm tài khoản trước qua Facebook (phần gateway của H-USER-1)
- `src/packages/strategy/google.strategy.ts:46-49` chỉ chặn `email_verified === false` tường minh.
- `src/packages/strategy/facebook.strategy.ts:38-51` không kiểm tra xác minh email.
- Sửa: bắt buộc email đã xác minh ở cả hai strategy, hoặc để USER quyết định.

### H-GW-2 (High, cần xác minh) Thiếu `trust proxy`, rate limit gộp một bucket
- `src/main.ts`: không thấy `app.set('trust proxy', ...)` (agent grep toàn `src`, chưa tự kiểm tra lại).
- `src/features/throttler/throttler.module.ts:7-11`: 3/s, 20/10s, 100/phút theo `req.ip`. Sau reverse proxy (repo có `.railwayignore`, có dấu hiệu chạy Railway) `req.ip` luôn là IP proxy.
- `src/features/auth/auth.controller.ts:77`: login 5/phút. Hệ quả: cả hệ thống chia sẻ 5 login/phút và 100 request/phút.
- Sửa: `app.set('trust proxy', 1)` trong `main.ts`.

### H-GW-3 (High) Không có logout, session không thu hồi được theo yêu cầu người dùng
- `src/features/auth/auth.controller.ts`: không có route `logout`.
- `user/src/features/auth/auth.service.ts:349-362` (`logoutService`) là code chết, không có route HTTP hay `@MessagePattern('auth.logout')`.
- Refresh token sống 7 ngày, `session:{id}` được gia hạn mỗi lần login/refresh. Access token hợp lệ tới khi session bị xóa.
- Đã kiểm tra, KHÔNG phải lỗi: đổi/reset mật khẩu, deactivate, xóa/đổi role đều xóa session.
- Sửa: thêm `POST /auth/logout` ở gateway và `auth.logout` ở USER, gọi `logoutService`.

### M-GW-1 (Medium) Guard fail-open khi kiểm tra session
- `src/packages/guards/jwt-auth.guard.ts:152-167`: lỗi/timeout `redis.exists` (2s, không retry) cho request qua. Token đã logout vẫn dùng được khi third chậm.
- Có chủ đích (comment ghi rõ), nhưng kết hợp với H-GW-3 thì thu hồi gần như vô hiệu khi hạ tầng lỗi.

### M-GW-2 (Medium) Lộ email đã đăng ký
- Gateway forward nguyên message 4xx (`src/features/rabbitmq/rmq.producer.ts:194`). `/auth/register` không có throttle riêng.

### M-GW-3 (Medium) Forgot-password: rate limit và thời gian
- `src/features/auth/auth.controller.ts:197-217`: không throttle riêng, chỉ 100/phút/IP, spam email được.

### M-GW-4 (Medium) Rate limit chỉ theo IP
- Ngoài login, `/refresh`, `/forgot-password`, `/reset-password`, `/register` không có throttle riêng. Không có khóa theo email.

### M-GW-5 (Medium) Download upload không kiểm tra quyền sở hữu
- `src/features/upload/upload.controller.ts:128-137`: không `@Roles`, không `@CurrentUser`. Chỉ cần `key` là stream được file từ R2. Key có UUID, chỉ khai thác khi key bị lộ.

### L-GW-1 (Low) JWT verify không chỉ định thuật toán
- `src/packages/guards/jwt-auth.guard.ts:130-132`: không có `algorithms`, `issuer`, `audience`. Hiện không khai thác được (có check `typ==='access'` và jsonwebtoken từ chối `alg:none`). Nên thêm `algorithms: ['HS256']`. Tương tự `user/.../auth.service.ts:325-327`.

### L-GW-2 (Low) Validation username thiếu max
- `src/packages/entities/auth/auth.schema.ts:59` không có `max(50)`, DB là `varchar(50)` (`src/database/schema.ts:90`). Username dài gây 500 thay vì 400.

### L-GW-3 (Low) Cookie và môi trường
- `src/packages/guards/oauth-state.guard.ts:49`: cookie `secure` chỉ khi `NODE_ENV === 'production'`. `.env` đang `development`.
- `src/packages/filters/http-exception.filter.ts:133`: stack trace trả client khi không phải production. Mặc định là development nếu thiếu biến.

### L-GW-4 (Low) Log lỗi RMQ có thể lộ credential
- `src/features/rabbitmq/rmq.producer.ts:64-74, 159`: object lỗi `JSON.stringify` vào log, có thể chứa URL broker. Cần xác minh format thực tế.

### L-GW-5 (Low) Không có helmet
- Không có header bảo mật cho API.

### L-GW-6 (Low) Token OAuth trong URL
- `src/features/auth/auth.controller.ts:293, 337`: đã dùng fragment (tốt hơn query), nhưng refresh token vẫn đi vào lịch sử trình duyệt.

### L-GW-7 (Low) Timeout RPC ghi
- `rmq.producer.ts:173`: không retry là đúng, nhưng client nhận 504 trong khi ghi có thể đã thành công, lần retry gặp 400 `EMAIL_EXISTS`.

### L-GW-8 (Low) Một session mỗi user
- Đăng nhập thiết bị B sẽ đăng xuất thiết bị A. Đây là thiết kế, ghi nhận để quyết định.

### Đã kiểm tra, KHÔNG thấy lỗi (gateway)
- Guard toàn cục và `@Public()` đúng chỗ. Refresh token không dùng làm access được (check `typ`).
- Phân quyền route: route admin có `RolesGuard`. `AdminRoleGuard` là code chết.
- Route không `@Roles` có `@CurrentUser`, IDOR được downstream kiểm tra (tuition `canRead`, `getDetailUser`, `loadAccessibleClass`).
- OAuth `state`: cookie HttpOnly, `timingSafeEqual`, dùng một lần, xóa cookie.
- CORS whitelist từ env, fail-fast secret JWT, redact log (`logger.interceptor.ts:147-167`), không retry lệnh ghi auth, đăng nhập dummy bcrypt chống enumeration.
- `/health/redis` không còn lộ key/value (lỗi cũ GW2-01 đã sửa).

---

## 3. `ui/` (Next.js, auth FE)

Các lỗi cũ UI-01, 05, 06, 07, 08 trong `gateway/reviews/ui-review.md` đã được sửa (đã xác minh). UI-05 còn fallback `getAccessToken()` ở `lib/axios/client.ts:117`.

### M-UI-1 (Medium) Mất phiên khi refresh lỗi tạm thời lúc load trang
- `components/providers/auth.provider.tsx:132-138` (`verifySession`): refresh trả false (kể cả lỗi mạng/5xx) thì luôn `failUnauthorized()` → xóa token. Mâu thuẫn với `lib/axios/refresh-access-token.ts:35-38` (cố tình giữ phiên khi lỗi mạng).
- Sửa: chỉ `failUnauthorized` khi refresh bị từ chối (400/401/403), lỗi mạng thì giữ token.
- Test `refresh-access-token.test.ts:85` chỉ cover `performRefresh`, không cover AuthProvider.

### M-UI-2 (Medium) OAuth callback nhận token không ràng buộc (login CSRF / session fixation)
- `components/auth/oauth-callback.tsx:25-39`: URL `/oauth/callback#accessToken=...&refreshToken=...` bất kỳ đều được lưu thành phiên.
- Sửa: lưu nonce ở sessionStorage khi `startGoogleOAuth`/`startFacebookOAuth`, chỉ nhận khi khớp.

### M-UI-3 (Medium) Logout không báo server
- `components/layout/app-sidebar.tsx:195-198` (`signOut`): chỉ xóa token phía client rồi `router.push("/login")`. Cần H-GW-3 (endpoint logout) trước.

### M-UI-4 (Medium, thiết kế) Access và refresh token đều trong localStorage
- `zustand/auth.store.ts:71-79` (persist `auth-store` có cả hai token) và `lib/axios/auth-storage.ts:22-33` (ghi thêm hai key riêng). Hai bản sao.
- XSS đọc được refresh token dài hạn. Gợi ý: refresh token dùng cookie httpOnly do BE set. Chưa thấy `dangerouslySetInnerHTML` trong `app/`, `components/`.

### L-UI-1 (Low) Sớm báo "đã xác thực" sau logout rồi login
- `zustand/auth.store.ts:65` `clearAuth` đặt `sessionChecked: true`. Login set token → `auth.provider.tsx:62` `isAuthenticated = true` trước khi `/users/detail-user` chạy. `login-form.tsx:70` và `auth.layout.tsx:16` redirect về `/` với `user = null`.

### L-UI-2 (Low) Lỗi không phải 401 đặt `sessionChecked = true`
- `auth.provider.tsx:117-121`: 500/403/network trên `detail-user` → `user=null`, `isAuthenticated=true`.

### L-UI-3 (Low) Role mặc định và route mở cho mọi role (chỉ FE)
- `hooks/useCurrentUserRole.ts:35`: không có user và không decode được role → `"TUTOR"`.
- `lib/rbac/route-access.ts:24` mặc định `ALL_ROLES` cho route không khai báo. `app/(app)/{accounts,transactions,budgets,categories,analytics,investments,practice-exams,settings}` không trong `ROUTE_ACCESS`. Server phải tự chặn.

### L-UI-4 (Low) Cookie guard là code chết
- `lib/axios/auth-redirect.ts:7-9` kiểm tra cookie `access_token`/`accessToken`, không có chỗ nào set cookie. `redirectIfAuthenticated` ở login/register/forgot/reset không bao giờ chạy.

### L-UI-5 (Low) Form auth thiếu validate phía client
- `components/auth/login-form.tsx:60-67`: không `zodResolver`, `noValidate`, password rỗng vẫn gọi API.
- `login-form.tsx:65, 230-236`: `rememberMe` không được đọc trong `handleSubmit`.
- `register-form.tsx`: không kiểm tra độ dài mật khẩu tối thiểu.

### L-UI-6 (Low) Refresh thừa sau 401
- `lib/axios/client.ts:160`: sau khi refresh xong vẫn gọi `refreshAccessTokenViaStore()` lần nữa (`refresh-access-token.ts:43-49` chỉ dedupe khi in-flight). Không lặp vô hạn.

### L-UI-7 (Low) Socket
- `components/providers/socket.provider.tsx:35-46`: socket phụ thuộc `accessToken`, đổi mỗi lần refresh → disconnect/connect lại.
- `socket.provider.tsx:49`: `onlineUsers` không reset khi logout.

### Đã kiểm tra, KHÔNG thấy lỗi (UI)
- Open redirect: không có `returnUrl`/`next`/`redirect_uri`, redirect cố định.
- Memory leak: có cleanup ở `auth.provider.tsx`, `query.provider.tsx`, `socket.provider.tsx`.
- Log lộ token: không `console.log` token.
- Vòng lặp refresh: `_retry401` chặn lặp (`client.ts:154-158`).

---

## 4. `tutor/` và `third/` (identity từ gateway, email, upload, redis)

Đối chiếu với `gateway/` và `user/`. Các bug trong mục này nằm trong `tutor/` và `third/`, còn phần cấu hình deploy nằm ở `gateway/docker-compose.yml`.

### H-TUT-1 (High, phụ thuộc deploy) Bypass thu hồi phiên và rate limit qua cổng HTTP trực tiếp
- `gateway/docker-compose.yml:87-127` publish tutor-service (4003) và third (4001) ra host.
- Gateway kiểm tra `session:{id}` qua `redis.exists` (`gateway/src/packages/guards/jwt-auth.guard.ts:153`). Còn `tutor/src/packages/guards/jwt-auth.guard.ts:101` và `third/src/packages/guards/jwt-auth.guard.ts:101` chỉ verify chữ ký JWT và kiểm tra row user tồn tại. Không kiểm tra session, không kiểm tra `isActive`. Tutor không có TokenBucketGuard.
- Kịch bản: user logout hoặc bị khóa, nhưng access token còn hạn 3h vẫn gọi được `http://host:4003/...` (classes, attendance, tuition, `/agents/run`, toàn bộ `/chat/*`). Gateway không proxy chat nên chat REST và Socket.IO `/chat` chỉ đi qua 4003.
- Mức High nếu cổng được expose. Nếu chỉ mạng nội bộ thì Medium.
- Sửa: bỏ publish cổng 4001/4003 trong production, hoặc thêm kiểm tra session + `isActive` vào guard của tutor và third.

### H-TUT-2 (High) RMQ không có trust boundary: service không xác thực identity trong payload
- Các handler `tutor/src/features/*/*.rpc.controller.ts` nhận `userId` từ payload, không verify JWT.
- `third/src/features/redis/redis.rpc.controller.ts` (`redis.get/exists/set/del`) không có auth. `third/src/features/uploads/upload.rpc.controller.ts`: `upload.download` nhận key bất kỳ, `upload.delete` chỉ kiểm tra `payload.role`. `third/src/features/email/email.rpc.controller.ts` không có auth (có zod validate `to`, uuid).
- Cấu hình: `gateway/docker-compose.yml:13,67-69` dùng mặc định `admin/admin` cho RabbitMQ, publish 5672 và 15672.
- Kịch bản: ai có credential broker gọi được `class.getAll`, `attendance.upsert`, `tuition.delete` với userId tùy ý. Với third: `redis.get session:*` hoặc `reset-password:*`, `redis.set session:<victim>`, `upload.download` bất kỳ key, `notification.create` với senderId/role giả.
- Sửa: đổi credential mặc định, không publish 5672/15672 ra ngoài, và ràng buộc queue theo service (ACL của broker).

### H-TUT-3 (High) Chat: thêm thành viên không kiểm tra chính sách
- `tutor/src/features/chat/conversation.service.ts:174` (`createGroupConversation`): không gọi `validateChatPermission`, `participantIds` không được validate.
- `conversation.service.ts:236` (`addParticipant`): chỉ kiểm tra người gọi là participant. Không kiểm tra quyền chat với user mới. Áp dụng cả với DIRECT conversation.
- Kịch bản: student tạo group hoặc thêm vào DM một tutor/admin/student ngoài lớp. Người đó đọc được toàn bộ `getMessages`.
- Sửa: gọi `validateChatPermission` cho mỗi `participantId` khi tạo group và khi `addParticipant`, và chặn `addParticipant` cho DIRECT.

### M-TUT-1 (Medium) Lesson gắn vào chapter của curriculum khác (cross-tenant write)
- `tutor/src/features/lesson/lesson.service.ts:33-52` (`createLessonService`): chỉ kiểm tra owner của `curriculumId` và UUID của `chapterId`. Không kiểm tra chapter thuộc curriculum đó, không kiểm tra chapter tồn tại. Tutor B tạo lesson trong chapter của tutor A.
- Sửa: kiểm tra `chapter.curriculumId === curriculumId` và chapter tồn tại.

### M-TUT-2 (Medium) Notification gửi sai người, có khả năng phishing
- `third/src/features/notification/notification.service.ts` (`createNotificationService`): TUTOR tạo type `TUTOR`/`STUDENT` với `userId`/`studentId`/`classId` tùy ý, không kiểm tra recipient thuộc lớp của tutor.
- `redirectUrl` cho phép mọi `https://` (`third/src/packages/entities/notification/notification.schema.ts:4-7`).
- Bypass `isSafeRedirectUrl`: chỉ chặn `//` và `/\`. Giá trị `/\t/evil.com` hoặc `/\n/evil.com` qua được validate, trình duyệt bỏ tab/newline thành `//evil.com`. Mức phụ thuộc FE có dùng `redirectUrl` làm href/redirect hay không (chưa kiểm tra `TUTOR-UI`).

### M-TUT-3 (Medium) Upload: không có ownership cho download, không giới hạn role/quota
- `third/src/features/uploads/upload.controller.ts:86-95` (`GET /upload/download`) và `upload.rpc.controller.ts:47`: mọi user đã login đọc được mọi key trong bucket. `getPublicUrl` trả URL công khai nên key có thể được chia sẻ.
- `POST /upload` (cả gateway `gateway/src/features/upload/upload.controller.ts` và third): không có RolesGuard. STUDENT/PARENT upload 10MB mỗi lần, không giới hạn số lượng.

### M-TUT-4 (Medium) Fail-open khi verify session (tham chiếu USER/gateway)
- `user/src/features/auth/auth.service.ts:307-320` (`assertRefreshSessionActive`): lỗi redis/RMQ thì cho qua. Refresh token đã revoke vẫn được chấp nhận khi outage.
- `gateway/src/packages/guards/jwt-auth.guard.ts` (~dòng 170): fail-open tương tự cho access token.
- Có ghi chú là chủ đích, nhưng vẫn là lỗ hổng revocation. Chi tiết xem mục 1 và 2.

### M-TUT-5 (Medium) Notification theo classId/studentId không hiển thị cho người nhận
- `third/src/features/notification/notification.repository.ts:40-50` (`findAll`) và `:83-90` (`findById`): chỉ lọc theo `userId` (người nhận) hoặc `senderId`. Notification chỉ có `classId`/`studentId` (userId null) không hiện cho ai ngoài sender và admin. Đây là lỗi "gửi đúng người".

### M-TUT-6 (Medium) Exercise: tutorId và studentId không validate theo role/enrollment
- `tutor/src/features/exercise/exercise.service.ts:66-95`: khi không có `sessionId`, không kiểm tra `tutorId` là TUTOR hay `studentId` thuộc lớp. Student gửi bài cho bất kỳ user làm "tutor". Khi có `sessionId`, tutor tạo bài cho studentId không thuộc lớp.

### L-TUT-1 (Low) Đọc curriculum/chapter/lesson không có ownership
- `tutor/src/features/curriculum/curriculum.service.ts:80-92` (`getCurriculumByIdService`), `chapter.service.ts` (`getChapterByIdService`), `lesson.service.ts` (`getLessonByIdService`, RPC không nhận userId). Gateway GET của chapter/lesson không có RolesGuard. Mọi user đã login đọc nội dung của tutor khác. Cần xác nhận đây có phải thiết kế catalog không.

### L-TUT-2 (Low) `POST /agents/run` cho mọi role
- `tutor/src/features/agents/agents.controller.ts:10` chỉ yêu cầu JWT. Mỗi lần gọi là một session Claude trả phí, không throttle. Sandbox (`agents.service.ts:17-25`) đã đúng.

### L-TUT-3 (Low) CORS `origin: true` kèm `credentials: true`
- `tutor/src/main.ts:26` và `tutor/src/features/chat/chat.gateway.ts`. Auth dùng Bearer nên rủi ro thấp, nhưng là cấu hình sai cho production.

### L-TUT-4 (Low) `jti` (reset token) log plaintext ở HTTP logger của USER
- `user/src/packages/interceptor/logger.interceptor.ts:50-55` log body. `SENSITIVE_KEYS` (dòng 5-13) không có `jti`/`resetToken`. Chỉ khi gọi trực tiếp HTTP của USER. Token TTL 5 phút.
- `user/src/features/auth/auth.service.ts:282-290`: `redis.del` sau reset là best-effort, token có thể dùng lại trong TTL nếu delete lỗi.

### L-TUT-5 (Low) Report RPC không có role check
- `tutor/src/features/report/report.rpc.controller.ts:32-44` trả dữ liệu toàn hệ thống, chỉ dựa vào RolesGuard ADMIN ở gateway (xem H-TUT-2).

### L-TUT-6 (Low) Hardening redis RPC
- `third/src/features/redis/redis.rpc.controller.ts` không chặn prefix nhạy cảm (chỉ HTTP controller có). `redis.set` cho phép key không TTL khi `ttlSeconds` undefined (`redis.service.ts`).

### L-TUT-7 (Low) Session tạo với tutorId tùy ý
- `tutor/src/features/session/session.service.ts:42-47` chỉ kiểm tra user tồn tại, không kiểm tra role TUTOR.

### Đã kiểm tra, KHÔNG thấy lỗi (tutor + third)
- Tutor JWT guard: verify secret qua `resolveJwtAccessSecret` (không fallback hardcode), kiểm tra `typ === 'access'`, không chấp nhận `alg: none`. `parseJwtUserRole` chỉ nhận role trong whitelist.
- Ownership tutor: class (`loadAccessibleClass`, 404 khi không quyền), session (`loadOwnedSession`, `getSessionService`), schedule (`loadOwnedSchedule`), attendance, tuition (`canRead`), exercise submit/grade, curriculum/chapter update/delete (`assertCurriculumOwner`).
- Repo list (class, session, schedule, exercise, tuition) scope đúng theo role/owner/enrolled.
- Chat: `createMessage`, `getMessages`, `getConversationById`, `markAsRead` có check participant. `ChatGateway` verify JWT ở handshake, `conversation:join` và `message:read` check participant.
- Test-scenario: `buildGatewayUrl` chặn thoát origin, gateway có RolesGuard ADMIN, `redact` chặn token trong response lưu lại.
- Third email: `escapeHtml` cho displayName, token là UUID qua zod, không template injection.
- Third redis HTTP: blocklist prefix (`session:`, `login-session:`, `reset-password:`, `refresh:`, `refresh-token:`) và RolesGuard ADMIN. Trace-context bỏ prefix `redis.` nên token không vào log trace.
- Third uploads: whitelist extension (không theo mimetype client), key UUID dưới `uploads/`, `assertValidKey` chặn `..` và `\`, ảnh re-encode bằng sharp, document `ContentDisposition: attachment`, `upload.delete` RPC fail-closed khi role không phải ADMIN.
- Third log WS `/logs`: verify JWT, role ADMIN, timer theo exp.
- Gateway forward identity: lấy userId/role từ `@CurrentUser()`, không từ body. Notification create ghi đè senderId/role bằng giá trị từ JWT.

Chưa kiểm tra: `TUTOR-UI` (cách FE dùng `redirectUrl`), cấu hình production thực tế (có expose 4001/4003 không), và chưa chạy test/runtime.

---

## Thứ tự ưu tiên sửa

1. **H-USER-2** (RPC createUser tạo ADMIN) và **M-USER-1** (tin actor trong payload): kiểm tra ai publish được `user_queue`.
2. **H-USER-1 + H-GW-1** (chiếm tài khoản qua OAuth/email chưa xác minh).
3. **H-GW-3 + M-UI-3** (thêm logout end-to-end), kèm **M-GW-1** (fail-open).
4. **H-GW-2** (`trust proxy`), xác minh trước khi sửa.
5. **M-USER-6** (USER HTTP có public không). Nếu có thì nâng thành High.
6. Các Medium còn lại, rồi Low.
