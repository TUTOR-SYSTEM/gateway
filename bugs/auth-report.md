# Auth review report

- Phạm vi: luồng auth từ UI → gateway → user (auth/user/admin) → tutor / third (identity, email, upload, redis).
- Mục 1–4: review bảo mật auth. Mục 5 (cập nhật 2026-10-17): flow review UI → gateway → service cho 21 module (tính đúng của luồng/contract).
- Phương pháp: 4 sub agent đọc code (mục 1–4; mục 5 dùng 21 agent `flow-review-*`), **chỉ đọc, không sửa, không chạy test**. Mọi mục là "đã đọc code", chưa tái hiện bằng test trừ khi ghi rõ.
- Thư mục thực tế của repo: `ui/`, `gateway/`, `user/`, `tutor/`, `third/` (CLAUDE.md ghi `USER/`, `THIRD_SERVICE/`, `TUTOR-UI/` là tên cũ).
- Báo cáo này nằm trong `gateway/bugs/`. Mỗi bug được xếp vào thư mục chứa đoạn code cần sửa. Bug liên quan nhiều repo được ghi ở repo chính và tham chiếu chéo.
- Chỉ chứa bug **còn mở** (đợt fix 2026-10-17 đã xóa phần đã sửa; typecheck + test các repo xanh, chưa chạy e2e/runtime). **Verdict: 0 Critical, 1 Major, còn lại là High/Medium/Low hạ tầng và Minor** (xem từng mục).

Mức độ: **High** = chiếm tài khoản / leo quyền / bypass xác thực. **Medium** = lộ thông tin, fail-open, thiếu giới hạn. **Low** = phòng thủ chiều sâu, không nhất quán.

Việc thủ công sau đợt fix (không thuộc bug, cần làm khi deploy):
- Thêm env vào `.env.compose.example`/deploy: `SESSION_CHECK_FAIL_OPEN` (mặc định false), `COOKIE_SECURE`, `TRUST_PROXY_HOPS`, `NOTIFICATION_REDIRECT_HOSTS`, `CORS_ALLOWED_ORIGINS` (user), `CORS_ORIGINS` (tutor/third), `JWT_REFRESH_SECRET` (bắt buộc ở user), `RABBITMQ_USER/PASSWORD`, `POSTGRES_PASSWORD`.
- Redis key đổi sang `session:{id}:{sid}`, `refresh:{id}:{sid}`: mọi user phải đăng nhập lại. Email cũ có chữ hoa cần chuẩn hóa một lần. Migration `0005` (`email_verified`) cần `db:migrate`.
- `NEXT_PUBLIC_THIRD_SERVICE_URL` của UI trỏ cổng 4001 không còn publish ở compose production; dùng `docker-compose.dev.yml` hoặc đi qua gateway.
- CORS R2 phải cho origin UI nếu UI tải file qua presigned URL (gateway trả 302).
- Khóa đăng nhập theo tài khoản: `LOGIN_MAX_ATTEMPTS` (mặc định 5), `LOGIN_ATTEMPT_WINDOW_SECONDS` (mặc định 900) ở `user`. Deploy `third` trước `user` vì `user` gọi RPC mới `redis.getdel`/`redis.incr`.

---

## 1. `user/` (auth / user / admin service)

| ID | Mức | Tiêu đề | Chi tiết |
|---|---|---|---|
| M-USER-1 | Medium | Tin tưởng actor trong payload RPC | • `actorId`/`actorRole` do gateway forward trong payload; service đã kiểm tra role và Zod-validate payload, nhưng publisher nào trên `user_queue` vẫn giả được actor.<br>• Sửa còn lại (hạ tầng): ACL broker theo service (user RabbitMQ riêng mỗi queue) hoặc ký actor (HMAC). Compose đã bỏ publish 5672/15672. |
| M-USER-3 | Medium | Forgot-password không có cooldown theo tài khoản | • Đăng nhập đã có khóa theo tài khoản (5 lần sai/15 phút, `login-fail:`). Còn lại: `forgot-password` chưa có cooldown theo email, nên có thể spam mail reset tới một hộp thư.<br>• Sửa: dùng `redis.incr` (đã có ở third) với cửa sổ ngắn theo email cho `forgot-password`. |
| M-USER-6 | Medium, cần xác minh hạ tầng | HTTP port của USER có thể public | • CORS đã siết bằng whitelist. Compose không còn publish user ra host. Callback Google/Facebook của user đã kiểm tra `state` (cookie HttpOnly, như gateway).<br>• `user` không có `ThrottlerModule`. Nếu port này public thì bypass được throttle IP của gateway. **Xác minh deploy thật; nếu public, nâng lên High.**<br>• Callback Google/Facebook của user (`user/src/features/auth/auth.controller.ts:299-300,340-341`) vẫn đưa `accessToken` và `refreshToken` vào query string, trong khi gateway dùng fragment + cookie HttpOnly. Sửa: bỏ route OAuth HTTP ở user (gateway đã xử lý), hoặc đổi sang fragment + cookie. |

---

## 2. `gateway/` (HTTP edge, JWT guard, auth controller, OAuth strategy)

| ID | Mức | Tiêu đề | Chi tiết |
|---|---|---|---|
| M-GW-3 | Medium | Forgot-password / register / refresh: rate limit chỉ theo IP | • Đã có throttle riêng theo IP cho `register`, `forgot-password`, `reset-password`, `refresh`, `ai.chat` (vd 3/phút).<br>• Chưa có cooldown/khóa theo email hoặc tài khoản (xem M-USER-3). |
| L-GW-7 | Low | Timeout RPC ghi mơ hồ | • Gateway không retry ghi (đúng), nhưng client nhận 504 trong khi ghi có thể đã thành công, retry gặp 409. Cần idempotency key. |
| — | Low | Gateway không kiểm tra `isActive` | • Gateway không có DB; chặn user bị khóa dựa vào việc user service xóa `session:{id}:*` khi deactivate/xóa/đổi role/đổi mật khẩu (đã làm). Không còn lỗ hổng nếu revoke chạy được; ghi nhận để xác minh runtime. |

### Đã kiểm tra, KHÔNG thấy lỗi (gateway)
- Guard toàn cục và `@Public()` đúng chỗ. Refresh token không dùng làm access được (check `typ`), token thiếu `sid` bị 401.
- Phân quyền route: route admin có `RolesGuard`. `AdminRoleGuard` là code chết (giữ lại).
- Route không `@Roles` có `@CurrentUser`, IDOR được downstream kiểm tra.
- OAuth `state`: cookie HttpOnly, `timingSafeEqual`, dùng một lần, xóa cookie.
- CORS whitelist từ env, fail-fast secret JWT, redact log, không retry lệnh ghi auth, đăng nhập dummy bcrypt chống enumeration.
- `/health/redis` không còn lộ key/value.

---

## 3. `ui/` (Next.js, auth FE)

Không còn bug mở trong mục này. Quyết định cần product xác nhận (không phải bug): bỏ checkbox `rememberMe` vì không có tác dụng; các route legacy (`accounts`, `transactions`, `budgets`, `categories`, `analytics`, `investments`, `practice-exams`) đang khóa `allow=[]`.

### Đã kiểm tra, KHÔNG thấy lỗi (UI)
- Open redirect: không có `returnUrl`/`next`/`redirect_uri`, redirect cố định.
- Memory leak: có cleanup ở `auth.provider.tsx`, `query.provider.tsx`, `socket.provider.tsx`.
- Log lộ token: không `console.log` token.
- Vòng lặp refresh: `_retry401` chặn lặp.
- Refresh token không còn trong JS/localStorage (cookie httpOnly).

---

## 4. `tutor/` và `third/` (identity từ gateway, email, upload, redis)

| ID | Mức | Tiêu đề | Chi tiết |
|---|---|---|---|
| H-TUT-2 | High, phụ thuộc hạ tầng | RMQ không có trust boundary | • Đã bỏ publish 5672/15672 và bắt buộc `RABBITMQ_USER/PASSWORD` trong `gateway/docker-compose.yml`. Chưa có ACL broker theo service: ai có credential broker vẫn gọi được `class.getAll`, `attendance.upsert`, `redis.get session:*`, `notification.create` với userId/role tùy ý.<br>• Sửa còn lại: user broker riêng + permission theo queue (`definitions.json`), hoặc ký actor (xem M-USER-1). |
| L-TUT-6 | Low | Hardening redis RPC | • `redis.set` đã từ chối key nhạy cảm thiếu TTL; `redis.get`/`redis.exists` qua RPC vẫn mở prefix nhạy cảm vì user/gateway/tutor cần đọc. Bảo vệ dựa vào ACL broker (H-TUT-2). |

### Đã kiểm tra, KHÔNG thấy lỗi (tutor + third)
- Tutor/third JWT guard: verify secret, `typ === 'access'`, không chấp nhận `alg: none`, yêu cầu `sid`, kiểm tra session + `isActive`, fail-closed (503).
- Ownership tutor: class, session, schedule, attendance, tuition, exercise, curriculum/chapter/lesson update/delete; ADMIN bypass trong service.
- Đọc curriculum/chapter/lesson là **catalog chung theo quyết định của chủ dự án** (không ownership khi đọc; `getById` không có thì 404).
- Report RPC kiểm tra ADMIN từ DB (fail-closed).
- Chat: mọi đường vào (create group, addParticipant, DIRECT, message, read) kiểm tra participant/chính sách.
- Third: email `escapeHtml`, redis HTTP blocklist prefix, upload whitelist extension + owner + presigned URL, WS `/logs` verify JWT + ADMIN.
- Gateway forward identity: lấy userId/role từ `@CurrentUser()`, không từ body.

Chưa kiểm tra: cấu hình production thực tế (có expose 4001/4003 không), chưa chạy e2e/runtime.

---

## 5. Flow review UI → gateway → service theo module (cập nhật 2026-10-17)

- Phạm vi: 21 module, mỗi module một sub agent `flow-review-<module>` (`.claude/agents/flow-review-*.md`, giao thức `.claude/skills/flow-review/PROTOCOL.md`, chạy bằng `/flow-review`). **Chưa chạy test/runtime**, mọi mục là suy luận từ code.
- Kết quả còn mở: **0 Critical / 1 Major / Minor còn lại ở 5.4** (đợt fix 2026-10-17 sửa toàn bộ Critical và 32/35 Major; typecheck + test xanh, chưa e2e).
- Mức độ riêng của mục này (về tính đúng của luồng, không phải bảo mật): **Critical** = luồng hỏng hẳn. **Major** = sai hành vi, quyền hoặc contract. **Minor** = lệch quy ước, Swagger, validate muộn.
- Chi tiết từng module nằm ở `gateway/bugs/<module>-report.md`. Module `auth` nằm trong chính file này.
- Tiền tố ID: `C-` Critical, `M-` Major; theo sau là viết tắt module.

### 5.1 Nguyên nhân gốc còn lại

1. **HTTP controller cũ còn trong service** (`user/features/{student,admin,auth}`, `tutor/features/{class,dashboard,tuition,report,attendance}`, `third/features/{notification,email,upload}`), nhân đôi route của gateway. Đã được guard session chặn (H-TUT-1) và compose không còn publish, nhưng vẫn là code trùng. Nên xóa nếu không dùng.

### 5.2 Critical (0)

Không còn bug mở.

### 5.3 Major (1)

| ID | Mức | Module | Nội dung |
|---|---|---|---|
| M-USR-3 | Major | user | STUDENT tự đổi tên bị 400 `STUDENT_CANNOT_UPDATE_NAME` (giữ có chủ đích vì lý do bảo mật), nhưng cần xác nhận UI self-update không còn gửi `firstName/lastName/email`/restricted fields (`user.schema.ts:214-223`, `user.service.ts`). `parentId`/`tutorId` đã bỏ khỏi `updateSelfSchema`. |

### 5.4 Minor còn lại (12 nhóm)

- **Quy ước**: tên pattern `auth.refresh`/`auth.login` lệch `<feature>.<methodName>`; `generate-code` GET của class dùng `HttpCode(201)`.
- **Dead code**: `AdminRoleGuard`; HTTP controller trùng route (5.1 #1).
- **Type UI**: `CreateStudentPayload.classCode`, `UpdateStudentPayload.classId` không có trong schema gateway; `reports-page` gọi `useGet` trong component.
- **Ngữ nghĩa cần xác nhận**: ai-chat history in-memory, UI không gửi `history` nữa; log trả `requestBody/responseBody`, chưa xác nhận redaction lúc ghi.
- **Khác**: `ui` — các Minor UI còn lại của 5.4 chưa rà hết; lint `test/` ở các repo báo parse error có sẵn (tsconfig không include `test/`); lint `src/database/database.module.ts` (`_default`), `src/app.controller.ts`, `rmq.producer.ts` có lỗi có sẵn; test `rpc-exception.filter.spec.ts` (user) fail có sẵn ("db exploded").

### 5.5 Module OK (chỉ Minor)

- **email**: không còn bug mở.
- **attendance**, **report**, **log**, **test-scenario**: pattern và payload khớp 1-1, không có pattern mồ côi, ownership/role đúng.

### 5.6 Chưa xác minh (cần kiểm tra thủ công)

- Service nào thực sự listen HTTP (liên quan 5.1 #1 và M-USER-6).
- `ui`: export/download qua 302 presigned URL có cần CORS R2 không.
- Redaction của `LoggerInterceptor` trước khi emit `log.create`.
- Toàn bộ thay đổi mới chỉ qua typecheck + unit test, chưa chạy end-to-end (login → refresh cookie → logout → revoke, student/admin RPC, upload/download).

---

## Thứ tự ưu tiên sửa

1. **H-TUT-2 + M-USER-1** (trust boundary RMQ): ACL broker theo service hoặc ký actor.
2. **M-USER-6** (xác minh USER HTTP có public không). Nếu public thì nâng thành High.
3. **M-USER-3 + M-GW-3** (cooldown theo tài khoản cho forgot-password/register/refresh).
4. **M-USR-3** (xác nhận UI).
5. Chạy e2e toàn flow auth mới; dọn Minor 5.4 và HTTP controller trùng (5.1 #1).
