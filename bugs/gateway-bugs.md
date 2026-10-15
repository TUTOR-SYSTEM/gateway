# Báo cáo review tĩnh – NestJS Gateway (`D:\projects\gateway\src`)

Phạm vi: đọc code (không build/test, không sửa file nguồn). Bỏ qua `node_modules`, `dist`.
Gateway là lớp HTTP mỏng, chuyển mọi nghiệp vụ sang user/tutor/third-service qua RabbitMQ, nên các lỗi dưới đây là lỗi tại gateway (auth, guard, validation, log, proxy). Những chỗ phụ thuộc hành vi service phía sau đều có ghi chú rõ.

## Thống kê theo mức độ

| Mức độ   | Số lỗi |
|----------|--------|
| Critical | 0      |
| High     | 2      |
| Medium   | 15     |
| Low      | 12     |
| **Tổng** | **29** |

---

## HIGH

### GW-01 – High – `currentPassword` không bị che (redact) khi ghi log, mật khẩu hiện tại lưu plaintext vào log và bảng `request_logs`
- File: `src/packages/interceptor/logger.interceptor.ts:10-28` (danh sách `SENSITIVE_KEYS`), dùng ở dòng 135-138, 144, 172-190.
- Mô tả: `SENSITIVE_KEYS` có `password`, `newPassword`, `oldPassword`, `confirmPassword`, nhưng KHÔNG có `currentPassword`. Body của `POST /users/change-password` (`changePasswordSchema` ở `src/packages/entities/user/user.schema.ts:~55-61`) gồm `currentPassword` và `newPassword`. Vì vậy mật khẩu hiện tại của người dùng được ghi vào log console (`[Request] ... body=`) và gửi qua `emitRequestLog` đến bảng `request_logs` của third-service (`requestBody`). Ngoài ra `userCode` của `POST /auth/login/user-code` (dùng như định danh đăng nhập) và các PII trong response (email, phone, trong tối đa 1000 ký tự) cũng được lưu.
- Cách sửa: đổi sang so khớp theo mẫu (regex `/pass(word)?|token|secret|authorization|cookie|otp/i`) thay vì liệt kê tên đầy đủ; thêm `currentPassword`, `userCode`; cân nhắc không log `responseBody` của các route `/auth/*` và `/users/*`.

### GW-02 – High – Không có rate limiting; decorator `Throttle` chỉ là metadata, không có guard nào đọc
- File: `src/packages/decorators/throttle.decorator.ts:1-11`; `src/app.module.ts:68-79` (chỉ có `LanguageGuard` và `JwtAuthGuard`); `src/features/auth/auth.controller.ts:87,133,180,206,228` (route public).
- Mô tả: `Throttle()` chỉ gọi `SetMetadata(THROTTLE_KEY, ...)`. Tìm trong `src` không có guard/interceptor nào dùng `THROTTLE_KEY` và cũng không có `ThrottlerModule`. Hậu quả: `/auth/login`, `/auth/login/user-code` (mã 6 ký tự + mật khẩu, role STUDENT/PARENT), `/auth/forgot-password` (spam email), `/auth/register`, `/auth/refresh`, `/auth/reset-password` bị brute force hoặc spam không giới hạn. `/ai-chat/chat` (gọi LLM, chi phí tiền) và `/upload` cũng không bị giới hạn.
- Cách sửa: dùng `@nestjs/throttler` (ThrottlerGuard làm `APP_GUARD`, lưu bằng Redis) hoặc tự viết guard đọc `THROTTLE_KEY`; áp giới hạn chặt cho login/forgot/reset/register và `ai.chat`, kèm khóa tạm theo tài khoản + IP.

---

## MEDIUM

### GW-03 – Medium – `GET /students` gọi `user.getUsers` không ép `role: 'STUDENT'`, trả về mọi loại user
- File: `src/features/student/student.controller.ts:137-167` (so sánh `src/features/admin/admin.controller.ts:145,231` có ép role sau khi spread).
- Mô tả: handler chỉ gửi `_query` (page, limit, search, tutorId, gender, isActive) sang `user.getUsers`. Query này không chứa `role`, và `getStudentsQuerySchema` (`student.schema.ts:42-54`) cũng không có. Comment trong admin controller nói rõ "USER chỉ lọc khi có role trong payload", nên danh sách "học sinh" sẽ gồm cả ADMIN/TUTOR/PARENT. Lọc theo `tutorId` và `gender` còn không có trong `getUsersQuerySchema`.
- Cách sửa: `send('user.getUsers', { ..._query, role: 'STUDENT' })` (đặt role sau spread).

### GW-04 – Medium – `POST /students` và `PUT /students/:id` gửi payload không khớp hợp đồng của `user.createUser` / `user.updateUser`
- File: `src/features/student/student.controller.ts:127-133` và `283-295`.
- Mô tả: Create gửi `{ studentName, parentName, studentPhone, ..., userId }` tới `user.createUser`, trong khi hợp đồng của pattern này (xem `createUserSchema`, `admin.controller.ts:124,207`) cần `email`, `firstName`, `lastName`, `password`, `role`. `createStudentSchema` không có các trường này (email còn optional, không có password) và gateway cũng không gán `role: 'STUDENT'` hay `actorId/actorRole`. Update gửi `studentName`, `birthday`, `parent*` tới `user.updateUser`, trong khi hợp đồng của pattern này là `updateSelfSchema` (`firstName`, `lastName`, `dateOfBirth`, ...). Hai đầu không khớp tên trường, nên khả năng cao dữ liệu bị bỏ qua hoặc request bị từ chối (cần xác nhận phía user-service). Comment ở dòng 50-51 cho thấy chính nhóm đã gặp sự cố tương tự với `get-student-code`.
- Cách sửa: map rõ ràng DTO học sinh sang payload đúng (`firstName/lastName`, `role: 'STUDENT'`, mật khẩu sinh tự động…) hoặc tạo pattern riêng `student.*` ở user-service; luôn truyền `actorId/actorRole`.

### GW-05 – Medium – Kiểm tra session "fail-open" và khóa session theo `userId` (không theo token)
- File: `src/packages/guards/jwt-auth.guard.ts:140-170`; `src/features/rabbitmq/rmq.constants.ts:69-71` (`redis.exists` timeout 2s, không retry).
- Mô tả: khi RabbitMQ/third-service/Redis chậm hoặc lỗi (timeout 2s), guard cho request đi qua (`return true` sau `catch`). Kẻ tấn công làm third-service nghẽn thì token đã logout/thu hồi dùng lại được; token chỉ cần còn hạn (3 giờ). Ngoài ra khóa là `session:<userId>` chứ không phải theo token/jti, nên logout hay thu hồi ở một thiết bị ảnh hưởng mọi token của user, và một access token cũ không thể bị thu hồi riêng lẻ.
- Cách sửa: với route nhạy cảm (admin, tài chính, đổi mật khẩu) fail-closed; thêm `jti`/`sid` vào JWT và kiểm tra `session:<userId>:<sid>`; ghi log/metric khi fail-open.

### GW-06 – Medium – Role và trạng thái tài khoản chỉ lấy từ JWT, không đồng bộ sau khi đổi quyền hoặc khóa tài khoản
- File: `src/packages/guards/jwt-auth.guard.ts:40-57` (role đọc từ payload), `src/packages/helpers/jwt.helper.ts:17` (access token sống 3 giờ).
- Mô tả: `RolesGuard`/`AdminRoleGuard` dùng `request.user.role` lấy trực tiếp từ token. Admin bị hạ quyền, hoặc user bị `isActive=false`/xóa, vẫn giữ quyền cũ tới 3 giờ trừ khi user-service chủ động xóa key `session:<id>` trong Redis (gateway không kiểm tra `isActive`). Vì guard fail-open (GW-05) nên biện pháp này cũng không đáng tin.
- Cách sửa: rút TTL access token (15 phút); khi đổi role/khóa tài khoản thì xóa key session và buộc đăng nhập lại; không ngầm đổi role lạ thành `STUDENT` (hàm `parseJwtUserRole` dòng 45) mà nên từ chối.

### GW-07 – Medium – Gateway không chuyển `role` sang tutor-service và không giới hạn tham số do client chọn, quyền dữ liệu phụ thuộc hoàn toàn vào downstream
- File: `src/features/class/class.controller.ts:64,83,112,121,140,149,161,173,184`; `session.controller.ts:61-147`; `schedule.controller.ts:63-144`; `tuition.controller.ts:59-124`; `exercise.controller.ts:61-127`; `attendance.controller.ts:36,53`; `dashboard.controller.ts:31`; `src/packages/entities/class/class.schema.ts:24`.
- Mô tả: tất cả handler chỉ gửi `userId`, không gửi `role`. Các route đọc/ghi (không có `@Roles`) như `GET /tuitions`, `GET /tuitions/:id`, `GET /tuitions/summary`, `GET /classes/:id/students`, `GET /attendances/session/:id`, `GET /exercises/:id` mà STUDENT/PARENT/ TUTOR nào cũng gọi được, tutor-service không phân biệt được ADMIN, TUTOR, STUDENT. Nếu service tự tra DB theo `userId` thì ổn, nhưng gateway không đảm bảo gì. Cụ thể gateway còn để `tutorId` do client tự gửi khi tạo lớp (`createClassSchema.tutorId` bắt buộc) và `createExerciseSchema.tutorId/studentId`: TUTOR có thể tạo lớp/bài tập mạo danh tutor khác nếu downstream không kiểm tra.
- Cách sửa: gửi kèm `role` (`{ userId, role, ... }`) cho mọi pattern; với TUTOR thì ép `tutorId = user.id` tại gateway; thêm `@Roles` cho các route tài chính (tuition) và quản trị lớp.

### GW-08 – Medium – Chapter/Lesson (đọc) không gửi userId/role và không có kiểm soát truy cập
- File: `src/features/chapter/chapter.controller.ts:57-78`; `src/features/lesson/lesson.controller.ts:60-81`.
- Mô tả: `GET /chapter`, `GET /chapter/:id`, `GET /curriculum/lessons`, `GET /curriculum/lessons/:id` chỉ gửi `{ query }`/`{ id }`. Mọi người dùng đã đăng nhập (kể cả PARENT/STUDENT không thuộc lớp nào) đọc được toàn bộ nội dung giáo trình, link tài liệu, bài tập của bất kỳ curriculum nào nếu biết/đoán `curriculumId`/`id`. Khác với `curriculum.controller.ts` vốn có gửi `userId`.
- Cách sửa: gửi `userId` + `role` và kiểm tra quyền sở hữu/được xem ở service; hoặc giới hạn route cho ADMIN/TUTOR.

### GW-09 – Medium – `GET /students/:id` cho TUTOR đọc chi tiết bất kỳ user nào
- File: `src/features/student/student.controller.ts:170-243` (đặc biệt 237-242).
- Mô tả: route cho phép `ADMIN, TUTOR` và gọi `user.getDetailUser` với `userId` do client truyền, không có `expectedRole: 'STUDENT'` (admin controller có, `admin.controller.ts:243`). Một TUTOR chỉ cần có UUID của ADMIN, TUTOR khác hoặc PARENT là lấy được hồ sơ (email, phone, địa chỉ…).
- Cách sửa: thêm `expectedRole: 'STUDENT'` và để user-service kiểm tra tutor chỉ xem học sinh của mình.

### GW-10 – Medium – Hầu hết tham số đường dẫn/query không được kiểm tra UUID, lỗi Postgres `22P02` trả về 500 thay vì 400
- File: `ParseUUIDPipe` chỉ dùng trong `student.controller.ts` và `test-scenario.controller.ts`. Các chỗ thiếu: `class.controller.ts:78,120,135,148,160,172,183`; `session.controller.ts:110,119,131,147`; `schedule.controller.ts:107,116,128,143`; `curriculum.controller.ts:108,131,146`; `chapter.controller.ts:46,76,89,103`; `lesson.controller.ts:47-48,79,92,106`; `exercise.controller.ts:90,103,122`; `tuition.controller.ts:70,96,108,123`; `notification.controller.ts:115,128,141`; `attendance.controller.ts:35`; `user.controller.ts:187,215,238`; `admin.controller.ts:154,170,189,241,259,278`; `upload.controller.ts` (key).
- Mô tả: id không phải UUID được chuyển nguyên xuống service, Postgres báo `invalid input syntax for type uuid` (mã `22P02`). `ErrorInterceptor` (`src/packages/interceptor/error.interceptor.ts:22-28`) chỉ map `23503/23505/23502/23514` nên lỗi này thành `500 Internal server error`. `classId` của `GET /tuitions/summary` (`tuition.controller.ts:70`) và `curriculumId/chapterId` của `POST /curriculum/lessons` (`lesson.controller.ts:47-48`) là `@Query` thuần, không qua Zod. Ngoài ra `DELETE /users/:id` và `PUT /users/:id` cho admin tự xóa/tự đổi quyền chính mình (không chặn `_id === _user.id`).
- Cách sửa: thêm `ParseUUIDPipe` cho mọi `:id`/`:classId`…; validate query bằng Zod; map `22P02` → 400 trong `ErrorInterceptor`; chặn admin tự xóa/vô hiệu hóa chính mình.

### GW-11 – Medium – Upload không kiểm tra loại file, mọi role đều upload được, nhân bản base64 trong một message RabbitMQ
- File: `src/features/upload/upload.controller.ts:63-113`, `src/features/upload/upload.module.ts`.
- Mô tả: chỉ giới hạn 10MB/file; không whitelist `mimetype`/đuôi file (HTML, SVG, exe…), mimetype do client khai. Bất kỳ user đã đăng nhập (kể cả STUDENT/PARENT) đều upload được. `/upload/multiple` cho 10 file × 10MB, được `toString('base64')` (tăng 33%) và gói trong một message RPC (tối đa ~133MB), tốn RAM gateway và có thể vượt giới hạn message của RabbitMQ; kèm `maxRetries: 0` nhưng timeout 60s. Không có rate limit (GW-02).
- Cách sửa: whitelist MIME + đuôi (kiểm tra magic bytes), giới hạn tổng dung lượng, giới hạn theo role; chuyển sang presigned URL upload thẳng lên R2 thay vì chuyển base64 qua RMQ.

### GW-12 – Medium – `GET /upload/download?key=` không kiểm tra quyền sở hữu
- File: `src/features/upload/upload.controller.ts:115-139`.
- Mô tả: chỉ kiểm tra `key` bắt đầu bằng `uploads/` và không có `..`. Bất kỳ user đăng nhập nào biết/đoán key đều tải được file của người khác (bài làm của học sinh, tài liệu học phí). Không truyền `userId/role` sang `upload.download` (khác `upload.delete` có `role`).
- Cách sửa: gửi `userId/role`, lưu chủ sở hữu/ACL của file và kiểm tra ở service; hoặc dùng key không đoán được + URL có chữ ký, hết hạn.

### GW-13 – Medium – `Content-Disposition` với tên file có ký tự ngoài Latin-1 làm response lỗi 500
- File: `src/features/upload/upload.controller.ts:44-48,131-138`.
- Mô tả: `sanitizeFilename` chỉ thay `" \r \n`. Tên file tiếng Việt (vd `Bài giảng.pdf`; ký tự như `ả`, `ạ`, `ộ` có mã > 0xFF) đưa thẳng vào header `Content-Disposition`; Node ném `ERR_INVALID_CHAR` khi `res.set`, và vì đã dùng `@Res()` nên lỗi đi qua filter thành 500. Dự án có chủ đích hỗ trợ tên tiếng Việt (xem `file.helper.ts`).
- Cách sửa: dùng `filename*=UTF-8''${encodeURIComponent(name)}` kèm `filename="ascii-fallback"` (hoặc dùng `res.attachment(name)`).

### GW-14 – Medium – Thiếu kiểm tra thời gian bắt đầu < kết thúc
- File: `src/packages/entities/class/class.schema.ts:20-21` (startTime/endTime); `src/packages/entities/session/session.schema.ts:95-96,139-140,144-145` (startAt/endAt, actualStartAt/actualEndAt); `src/packages/entities/schedule/schedule.schema.ts:176-183,209-212` và mảng ở dòng 187-198 (startTime/endTime HH:mm); cũng `getSessionsSchema` (`startDate` > `endDate`).
- Mô tả: không có `refine` nào đảm bảo `end > start`; chấp nhận lớp/buổi học/lịch có thời gian kết thúc trước giờ bắt đầu, `createSchedules` cũng không chống trùng `dayOfWeek`.
- Cách sửa: thêm `superRefine` cho từng schema; với update dùng khi cả hai trường có mặt (phần còn lại kiểm tra ở service).

### GW-15 – Medium – `z.coerce.number()` biến `null`/chuỗi rỗng thành 0 ở điểm số và tiền học phí
- File: `src/packages/entities/exercise/exercise.schema.ts:43-46` (`score`), `src/packages/entities/tuition/tuition.schema.ts:8` (`amount`), cũng `class.schema.ts:16,42` (`tuition`), `curriculum.schema.ts:101`.
- Mô tả: Zod 4 `coerce.number` dùng `Number(x)`: `null`, `""`, `" "`, `false` đều thành `0`. Body `{ "score": null }` hay `{ "score": "" }` chấm bài 0 điểm; `{ "amount": "" }` tạo học phí 0đ mà không báo lỗi. Thông báo "Amount must be positive" nhưng `min(0)` cho phép 0.
- Cách sửa: dùng `z.number()` (hoặc preprocess từ chối `null`/chuỗi rỗng), `positive()` cho `amount`.

### GW-16 – Medium – Trường URL/key của file không được kiểm tra scheme và nguồn gốc
- File: `src/packages/entities/exercise/exercise.schema.ts:3-7` (`url: z.string()` không kiểm tra gì); `session.schema.ts:11-15`, `curriculum.schema.ts:31-35` (`z.string().url()` chấp nhận `javascript:`, `data:`, `file:`).
- Mô tả: học sinh/tutor có thể lưu `url` tùy ý (kể cả `javascript:alert(1)`) cho bài làm, tài liệu, buổi học; nếu frontend render thành `<a href>` thì thành stored XSS đối với người xem (tutor/admin). `key` tùy ý cũng cho phép trỏ tới file của người khác rồi nhờ admin xóa qua `DELETE /upload/:key`.
- Cách sửa: ràng buộc `https:` và domain R2/CDN của dự án; kiểm tra `key` bắt đầu bằng `uploads/` và thuộc user.

### GW-17 – Medium – Đăng nhập OAuth chấp nhận email chưa xác minh, có nguy cơ chiếm tài khoản qua liên kết theo email
- File: `src/packages/strategy/facebook.strategy.ts:38-42,45-52`; `src/packages/strategy/google.strategy.ts:41-51`; xử lý ở `auth.controller.ts:293-296,336-339`.
- Mô tả: Facebook không kiểm tra email đã xác minh (Facebook có thể trả email chưa xác minh/đổi được). Google chỉ từ chối khi `email_verified === false` tường minh, claim vắng mặt vẫn được qua. Gateway chuyển `email` sang `auth.googleLogin/facebookLogin` và nhận lại token. Nếu service liên kết theo email, kẻ tấn công tạo tài khoản OAuth với email nạn nhân (chưa xác minh) sẽ đăng nhập vào tài khoản có sẵn. (Hành vi liên kết nằm ở user-service, chưa xác minh được tại gateway.)
- Cách sửa: yêu cầu `email_verified === true` (Google) và chặn Facebook trừ khi xác minh; chỉ liên kết theo `googleId/facebookId` đã lưu, hoặc yêu cầu đăng nhập mật khẩu trước khi liên kết.

---

## LOW

### GW-18 – Low – `decodeMulterFilename` được định nghĩa nhưng không dùng, tên file tiếng Việt bị lỗi mojibake khi upload
- File: `src/packages/helpers/file.helper.ts:8-10` (không có nơi nào gọi); `src/features/upload/upload.controller.ts:80,107` gửi `file.originalname` thô.
- Mô tả: multer giải mã header filename theo latin1; file `Bài giảng.pdf` gửi sang third-service thành `BÃ i giáº£ng.pdf`.
- Cách sửa: gọi `decodeMulterFilename(file.originalname)` trước khi gửi.

### GW-19 – Low – `grade` của curriculum cho phép `NaN`
- File: `src/packages/entities/curriculum/curriculum.schema.ts:18`.
- Mô tả: `z.union([z.string(), z.number()]).transform(Number)` với `"abc"` cho `NaN` (không báo lỗi); `JSON.stringify(NaN)` = `null` khi gửi qua RMQ nên `grade` thành `null`/lỗi DB.
- Cách sửa: `z.coerce.number().int().min(1).max(12)`.

### GW-20 – Low – Cấu hình mặc định nguy hiểm/không nhất quán giữa các môi trường
- File: `src/features/rabbitmq/rmq.constants.ts:7` (mặc định `amqp://guest:guest@localhost:5672`); `src/features/auth/auth.controller.ts:298-300,341-344` (mặc định redirect `http://localhost:3000/oauth/callback`); `src/packages/strategy/facebook.strategy.ts:24-27` (dùng `BACKEND_URL`) so với `google.strategy.ts:27-29` (dùng `GOOGLE_CALLBACK_URL`).
- Mô tả: thiếu env thì production âm thầm dùng guest/localhost; Facebook và Google cấu hình callback bằng hai biến khác nhau, dễ sai ở deploy (redirect_uri_mismatch). Cả hai strategy còn khiến app không khởi động được nếu thiếu thông tin Facebook dù chỉ dùng Google.
- Cách sửa: fail-fast khi `NODE_ENV=production` thiếu env; thống nhất biến callback; cho phép bật/tắt từng provider.

### GW-21 – Low – Swagger và `TestScenarioModule` mở khi `NODE_ENV` không được đặt; Bearer token chuyển sang service khác
- File: `src/main.ts:45`; `src/app.module.ts:61`; `src/features/test-scenario/test-scenario.controller.ts:186-189,305-313`.
- Mô tả: điều kiện là `NODE_ENV !== 'production'`, nên triển khai thiếu biến này sẽ lộ `/api-docs` và route test (admin). `resolveFixture` và `run` lấy header `Authorization` của admin và đẩy sang third-service qua RMQ (token nằm trong message/queue).
- Cách sửa: dùng allowlist (`NODE_ENV === 'development'`/biến bật rõ ràng); cân nhắc dùng token riêng cho test-run thay vì chuyển token người dùng.

### GW-22 – Low – `key` dạng mảng làm `assertValidKey` ném TypeError → 500
- File: `src/features/upload/upload.controller.ts:38-42,124-126`.
- Mô tả: `GET /upload/download?key=a&key=b` cho `key` là mảng; `!key` sai và `key.startsWith` không tồn tại → TypeError (500) thay vì 400.
- Cách sửa: `if (typeof key !== 'string' ...) throw new BadRequestException`, hoặc validate bằng Zod.

### GW-23 – Low – Chính sách mật khẩu không thống nhất giữa các luồng
- File: `src/packages/entities/auth/auth.schema.ts:36` (đăng ký/reset: tối đa 25); `src/packages/entities/user/user.schema.ts:61` (đổi mật khẩu: tối đa 20) và `:250` (tạo user); `src/packages/entities/admin/admin.schema.ts:69` (tối đa 20); `src/features/admin/admin.controller.ts:47` (Swagger ghi tối đa 14).
- Mô tả: mật khẩu 21-25 ký tự đăng ký được nhưng không đặt lại được qua `change-password` (cùng mức tối thiểu 6 so với 8 ở các luồng khác); Swagger của admin sai so với code.
- Cách sửa: dùng chung một `passwordFieldSchema` cho mọi luồng, sửa Swagger.

### GW-24 – Low – Nguy cơ route bị che: `curriculum/lessons` so với `curriculum/:id`
- File: `src/features/lesson/lesson.controller.ts:32,60` (`GET /curriculum/lessons`) và `src/features/curriculum/curriculum.controller.ts:43,103` (`GET /curriculum/:id`); thứ tự import ở `src/app.module.ts:46-47` (LessonModule trước CurriculumModule).
- Mô tả: hiện chạy đúng chỉ nhờ thứ tự import module; đổi thứ tự thì `/curriculum/lessons` bị `:id` bắt với `id="lessons"`.
- Cách sửa: dời lesson sang tiền tố khác (`/lessons`) hoặc khai báo `:id` bằng `ParseUUIDPipe` (sẽ trả 400 thay vì chạy sai) cho curriculum.

### GW-25 – Low – `GET .../generate-code` không có guard role và trả 201
- File: `src/features/class/class.controller.ts:86-95`; `src/features/curriculum/curriculum.controller.ts:47-53` (`@HttpCode(CREATED)` cho GET).
- Mô tả: STUDENT/PARENT cũng gọi được; GET trả 201 và mỗi lần gọi có thể tạo/đặt trước mã.
- Cách sửa: thêm `@Roles('ADMIN','TUTOR')`; để mã trả 200.

### GW-26 – Low – Endpoint health công khai gọi RPC (khuếch đại tải)
- File: `src/app.controller.ts:220-263` (`GET /health/redis`, `@Public`), cùng cơ chế retry `rmq.producer.ts:137-213`.
- Mô tả: mỗi request không xác thực kích hoạt một RPC tới third-service (tối đa 3 lần × 10s với backoff), không rate limit → dễ làm nghẽn hàng đợi. Comment ở `checkPostgresConnection` (dòng 203-204) nói "public endpoint" nhưng route thực tế là ADMIN, gây hiểu nhầm.
- Cách sửa: health chỉ trả ok cục bộ; kiểm tra phụ thuộc dùng route riêng có cache và rate limit.

### GW-27 – Low – `GET /users/get-by-field` nhận tên cột tùy ý
- File: `src/features/user/user.controller.ts:115-119`; `src/packages/entities/user/user.schema.ts:95-98` (`field: z.string().nonempty()`).
- Mô tả: admin có thể truyền `field=password` (hoặc cột nhạy cảm khác) để dò hash/tra cứu; phụ thuộc user-service có whitelist hay không (chưa xác minh được).
- Cách sửa: `z.enum(['email','username','userCode','phone'])`.

### GW-28 – Low – Người dùng tự đổi `email` qua `PUT /users` mà không xác minh
- File: `src/features/user/user.controller.ts:144-168`; `user.schema.ts:126` (`email` còn trong `updateSelfSchema`, dòng 214-223 chỉ bỏ `role/isActive/userCode/googleId/facebookId/classId/gradesId`).
- Mô tả: email là định danh đăng nhập, đích gửi quên mật khẩu và khóa liên kết OAuth; token đã đánh cắp có thể đổi email để chiếm tài khoản lâu dài.
- Cách sửa: bỏ `email` khỏi `updateSelfSchema` hoặc yêu cầu xác minh qua email/mật khẩu hiện tại.

### GW-29 – Low – `limit` của `GET /test-scenarios/:id/runs` không có cận trên
- File: `src/features/test-scenario/test-scenario.controller.ts:255-259`.
- Mô tả: `ParseIntPipe` cho phép `limit=1000000` hoặc số âm, truy vấn không giới hạn (route dành cho admin, môi trường không phải production).
- Cách sửa: dùng Zod `z.coerce.number().int().min(1).max(100)`.
