# Bug review — module `auth`

Ngày: 2026-10-16
Phạm vi: `src/features/auth/` + `src/packages/strategy/` (google, facebook, jwt-user) + `src/packages/guards/` (jwt-auth, oauth-state) + `src/packages/entities/auth/` + `src/features/rabbitmq/rmq.producer.ts`, `rmq.constants.ts` + `src/app.module.ts`, `src/main.ts`.
Không build/test, chỉ đọc tĩnh.

| Mức | Số lượng |
|---|---|
| Critical | 0 |
| High | 1 |
| Medium | 1 |
| Low | 7 |

## Bug

| ID | Mức | File:dòng | Vấn đề | Kịch bản lỗi | Hướng sửa |
|---|---|---|---|---|---|
| AUTH-01 | High | `src/app.module.ts:33-79`; `src/features/auth/auth.controller.ts` (các route `@Public()` login, login/user-code, refresh, forgot-password, reset-password, register) | Không có rate limit nào ở gateway: không có ThrottlerModule/`@Throttle` trong `app.module.ts` và các route auth đều `@Public()` | Brute force `POST /auth/login/user-code` (userCode 6 ký tự + password) không giới hạn số lần thử. `POST /auth/forgot-password` có thể spam email qua third-service. Chưa xác minh user-service có lockout/throttle riêng hay không. | Thêm `@nestjs/throttler` (global, ngưỡng chặt cho login/user-code/forgot-password/reset-password). Nếu user-service đã có lockout thì ghi nhận và giảm xuống Medium. |
| AUTH-02 | Medium | `src/features/rabbitmq/rmq.producer.ts:167-174` (áp dụng cho `auth.register`, `auth.forgotPassword`, `auth.resetPassword`, `auth.googleLogin`, `auth.facebookLogin`, `auth.login`, `auth.refresh`) | Retry chỉ chặn khi lỗi là business error (có `statusCode`) hoặc timeout trên pattern không idempotent. Lỗi kết nối/kênh (ví dụ `Channel closed`, `{err, url}`) không có `statusCode` và không phải timeout, nên vẫn bị retry tối đa 2 lần với pattern ghi | Message đã được user-service xử lý nhưng reply bị mất do đứt kênh. Gateway gửi lại, dẫn đến đăng ký trùng (nếu không có unique constraint), gửi lại email quên mật khẩu, hoặc `auth.googleLogin` phát hành token thêm cho cùng lần OAuth. | Áp dụng `unsafeToRetry` cho mọi lỗi (không chỉ timeout) khi pattern không idempotent, hoặc chỉ retry lỗi xảy ra trước khi publish. Với các pattern auth ghi, đặt `maxRetries: 0` trong `RMQ_SLOW_PATTERN_POLICIES`/`resolveRmqCallPolicy`. Cần xác minh thêm ở user-service (idempotency key) — chưa có bằng chứng. |
| AUTH-03 | Low | `src/packages/strategy/jwt-user.strategy.ts` (export trong `src/packages/strategy/index.ts`) | `JwtUserStrategy` (`'jwt-user'`) được export nhưng không thấy đăng ký trong `auth.module.ts` hoặc `app.module.ts`. Guard thật là `JwtAuthGuard`. | Code chết, dễ gây nhầm rằng có hai cơ chế verify JWT khác nhau. Chưa grep toàn repo (Bash bị chặn), nên chưa loại trừ việc được dùng ở module khác. | Xác minh bằng `grep -rn JwtUserStrategy src`. Nếu không dùng thì xóa cùng export. |
| AUTH-04 | Low | `src/packages/guards/jwt-auth.guard.ts` (hàm `parseJwtUserRole`) | Không nhất quán: `role` thiếu (`undefined`) → 401 `Check role user failed`, nhưng `role` là chuỗi lạ (ví dụ `'SUPERADMIN'`) → im lặng trả về `'STUDENT'` | Token có role không nhận diện được sẽ được coi là STUDENT thay vì bị từ chối. Hiện token do user-service ký nên khó khai thác, nhưng hành vi fallback là ngầm. | Từ chối (401) cho mọi role không thuộc `JWT_ROLES`, không fallback im lặng. |
| AUTH-05 | Low | `src/packages/guards/jwt-auth.guard.ts` (`SESSION_CACHE_TTL_MS = 5_000`, cache theo `userId`, mỗi instance) | Logout/revoke có cửa sổ tối đa 5 giây ở từng instance gateway vì positive cache. Với nhiều replica, cache không đồng bộ | Session đã bị xóa trên Redis vẫn được chấp nhận tới 5 giây trên instance đang cache. Đây là đánh đổi có ghi chú trong code, nên mức Low. | Ghi nhận như đánh đổi đã biết. Nếu cần revoke tức thì, bỏ cache hoặc kiểm tra theo session id thay vì userId. |
| AUTH-06 | Low | `src/packages/guards/jwt-auth.guard.ts` (nhánh `catch` quanh `redis.exists`); `src/features/rabbitmq/rmq.constants.ts:66-68` | Fail open khi third-service lỗi là có chủ đích. Khi third-service chậm, mỗi request chưa có cache chờ tối đa 2s (`timeoutMs: 2000`) trước khi cho qua, không có circuit breaker | Khi third-service chậm, latency toàn bộ API tăng thêm ~2s mỗi request. Khi third-service down hoàn toàn, token đã bị revoke vẫn được chấp nhận. | Ghi nhận là quyết định có chủ đích. Cân nhắc circuit breaker để không chờ 2s liên tục. |
| AUTH-07 | Low | `src/features/auth/auth.controller.ts:57-58` (`register`: `@Public()` + `@ApiBearerAuth('access-token')`); `auth.controller.ts:100` (login `password` `minLength: 6, maxLength: 25`) vs `src/packages/entities/auth/auth.schema.ts:53-55` (`loginPasswordFieldSchema` chỉ `min(1)`) | Contract drift giữa Swagger và Zod. `register` là route công khai nhưng Swagger yêu cầu bearer. Swagger login ghi password 6-25 ký tự nhưng schema chấp nhận 1+ ký tự | Client đọc Swagger tưởng phải gửi bearer cho register, hoặc tưởng password ngắn hơn 6 ký tự sẽ bị từ chối khi login. | Bỏ `@ApiBearerAuth` khỏi `register`. Sửa `@ApiBody` của login cho khớp `loginPasswordFieldSchema` (hoặc đổi schema nếu muốn 6-25). |
| AUTH-08 | Low | `src/features/auth/auth.controller.ts:298-302` và `341-346` (redirect với token trong hash); `src/packages/strategy/google.strategy.ts:27-29` (fallback `http://localhost:8888/auth/google/callback`) | Access/refresh token được đưa vào URL fragment khi redirect OAuth, nên nằm trong lịch sử trình duyệt. `GoogleStrategy` có fallback localhost cho `callbackURL` khi thiếu `GOOGLE_CALLBACK_URL`, trái với comment ở đầu file ("no placeholder") | Token nằm trong history. Thiếu env ở production sẽ không báo lỗi lúc boot mà chỉ lỗi `redirect_uri_mismatch` từ Google. | Chuyển sang cookie HttpOnly hoặc one-time code đổi token qua POST. Với `GOOGLE_CALLBACK_URL`, throw lúc boot như client id/secret. |
| AUTH-09 | Low | `src/features/auth/auth.controller.ts:298-302` và `341-346` (`this.configService.get(...) ?? ...` rồi `new URL(redirectBase)`) | Dùng `??` nên nếu env redirect được set thành chuỗi rỗng `''`, `new URL('')` ném lỗi. Lỗi xảy ra sau khi `auth.googleLogin` đã phát hành token, nên user nhận 500 dù đăng nhập thành công | Env rỗng ở deploy làm mọi lần OAuth callback thất bại sau khi tạo session. | Dùng `||` hoặc kiểm tra `trim()` rồi fallback. Kiểm tra env ở boot. |

## Phụ thuộc cần repo khác (nếu có)
- `auth.login`, `auth.loginByUserCode`, `auth.register`, `auth.refresh`, `auth.forgotPassword`, `auth.resetPassword`, `auth.googleLogin`, `auth.facebookLogin` phải có `@MessagePattern` tương ứng ở `user/` (`*.rpc.controller.ts`). Chưa kiểm tra vì nằm ngoài repo này.
- AUTH-01: kiểm tra lockout/throttle ở `user/` cho login và user-code.
- AUTH-02: kiểm tra idempotency key hoặc unique constraint cho đăng ký và gửi email ở `user/` và `third-service/`.
- `redis.exists` và `redis.get` (cho session) phải tồn tại ở `third-service/`.

## Ghi chú xác minh
- Bash bị chặn tạm thời (rate limit classifier), nên chưa chạy `grep` toàn repo. Khẳng định ở AUTH-03 chỉ dựa trên `app.module.ts`, `auth.module.ts` và `packages/strategy/index.ts` đã đọc.
- Đã đọc OAuth state guard và `passport-oauth2` (`node_modules/passport-oauth2/lib/strategy.js`). Luồng `state` (cookie + `NullStore`) hoạt động đúng, không có bug CSRF.
- Đã đọc `RmqProducer` và `rmq.constants.ts`. Timeout/retry policy đúng với các pattern đọc (`redis.exists` không retry), nhưng có lỗ hổng AUTH-02.

## Đã đọc
- `CLAUDE.md`, `.claude/rules/conventions.md`, `.claude/rules/nestjs-feature-pattern.md`
- `src/features/auth/auth.controller.ts`, `src/features/auth/auth.module.ts`
- `src/packages/strategy/google.strategy.ts`, `facebook.strategy.ts`, `jwt-user.strategy.ts`, `index.ts`
- `src/packages/guards/jwt-auth.guard.ts`, `oauth-state.guard.ts`, `index.ts`
- `src/packages/entities/auth/auth.schema.ts`, `auth.dto.ts`
- `src/packages/pipes/zod-validation.pipe.ts`
- `src/features/rabbitmq/rmq.producer.ts`, `rmq.constants.ts`
- `src/app.module.ts`, `src/main.ts`, `package.json`
- `src/data/constants/error.constant.ts`
- `node_modules/passport-oauth2/lib/strategy.js`
