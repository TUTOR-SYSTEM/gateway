# Gateway: báo cáo lỗi (kiểm chứng lại 2026-10-11)

Báo cáo gốc viết ngày 2026-10-10 (134 route, 74 BUG). Lượt này kiểm chứng lại từng lỗi trên gateway dev (`localhost:8888`) đang chạy code hiện tại, đối chiếu source. Ba sub-agent chạy song song, mỗi agent một nhóm; lead đối chiếu lại DB và sửa các lỗi đã khoanh vùng.

Nhãn trạng thái:
- **FIXED**: đã kiểm chứng live, hết lỗi.
- **STILL BUG**: đã kiểm chứng live, vẫn lỗi.
- **CHANGED**: lỗi cũ không còn, nhưng hành vi đã đổi và cần xem lại.
- **NOT RETESTED**: chưa kiểm chứng live (sẽ phải ghi dữ liệu). Ghi rõ nguồn là source hay không.

## 1. Tóm tắt

Số lượng theo từng trạng thái không được tổng hợp lại thành con số; xem trạng thái của từng dòng trong các bảng ở mục 2 và 3. Các route chưa kiểm chứng live được liệt kê ở mục 4.

Lỗi nghiêm trọng nhất còn mở là **chiếm tài khoản qua session Redis**: `/health/redis` công khai lộ session key, và `GET /redis?key=` cho phép mọi user đã đăng nhập đọc session JWT của user khác (đã kiểm chứng: STUDENT đọc được session của ADMIN).

## 2. Lỗi nghiêm trọng còn mở (ưu tiên)

| # | Route | Trạng thái | Bằng chứng | Nguyên nhân |
|---|---|---|---|---|
| 6 | GET /health/postgres | STILL BUG | 200, `sampleUsers` lộ email/username/role không cần auth | `app.controller.ts:158` là `@Public`, trả thẳng dữ liệu mẫu |
| 7 | GET /health/redis | STILL BUG | 200, `sampleKeys` lộ `session:<uuid>` kèm JWT | `app.controller.ts:206` là `@Public` |
| 101 | GET /redis?key= | STILL BUG | STUDENT đọc `session:<admin>` → 200, trả JWT | `redis.controller.ts:24-33` không có role/ownership, forward mọi key tới `redis.get` |
| 86 | GET /students | STILL BUG | 200, STUDENT liệt kê email toàn bộ student | `student.controller.ts:114-138` không có `@Roles` |
| 126 | GET /users | STILL BUG | 200, STUDENT lấy được toàn bộ danh bạ | `user.controller.ts:52-73` không có `@Roles`; `user.rpc.controller.ts:21` trả cả danh sách |
| 67 | GET /notifications/:id | STILL BUG | 200 với bản ghi không thuộc user | Controller chỉ truyền `id`; `notification.service.ts` `findById` không kiểm tra owner |
| 68 | PATCH /notifications/:id/read | NOT RETESTED (mutation) | Source: không kiểm tra owner | `notification.controller.ts:94-101`, `markAsRead` |
| 69 | DELETE /notifications/:id | NOT RETESTED (mutation) | Source: không kiểm tra owner | `notification.controller.ts:103-110`, `delete` |
| 52 | PUT /curriculum/:id | NOT RETESTED (mutation) | Source: chỉ kiểm tra tồn tại, không kiểm tra owner | `curriculum.controller.ts:93-116`; tutor-service `updateCurriculumService` |
| 53 | DELETE /curriculum/:id | NOT RETESTED (mutation) | Source: giống trên | `curriculum.controller.ts:118-125`; `deleteCurriculumService` |
| 129 | POST /users | NOT RETESTED (mutation) | Source: không có role guard, `role` được truyền qua | `user.controller.ts:108-124`; `user.schema.ts:276`; `createUserService` |
| 130 | PUT /users | FIXED cho leo quyền (DB xác nhận role không đổi) | 200, role trong response vẫn STUDENT | `user.controller.ts:126-143` |
| 131 | PUT /users/:id | NOT RETESTED (mutation) | Source: không có `@Roles`, không kiểm tra caller | `user.controller.ts:145-163`; `user.rpc.controller.ts:48-51` |
| 132 | PUT /users/:id/status | NOT RETESTED (mutation) | Source: không kiểm tra caller | `user.controller.ts:165-178` |
| 133 | DELETE /users/:id | NOT RETESTED (mutation) | Source: không kiểm tra caller | `user.controller.ts:180-193`; `deleteUserByAdminService` |
| 15 | POST /chapter/:curriculumId | STILL BUG | STUDENT vào tới insert (không có role/owner); curriculum không tồn tại → 500 thay vì 404 | `chapter.controller.ts:29-44`; `chapter.service.ts:30` không kiểm tra curriculum |

Ghi chú về ownership: `curriculum`, `notifications`, `users` đều không có `RolesGuard`. Chỉ `admin`, `report`, `log`, `test-scenario` dùng `RolesGuard` (`app.module.ts` chỉ có `JwtAuthGuard` và `LanguageGuard` làm global guard). Các request probe với UUID ngẫu nhiên trả 400/404 từ downstream chứ không phải 403 từ gateway, điều này xác nhận thiếu guard.

## 3. Kết quả theo từng lỗi trong báo cáo gốc

### Auth

| # | Route | Trạng thái | Ghi chú |
|---|---|---|---|
| 8 | POST /auth/register | NOT RETESTED (success) | Message thành công copy từ login: "Đăng nhập thành công" (`success.i18n.ts:14`). Validation 422 đúng. |
| 9 | POST /auth/login | STILL BUG | Sai mật khẩu trả 400 `INVALID_CREDENTIALS`; Swagger ghi 401 (`auth.controller.ts:119`). Status quyết định ở `USER/src/features/auth/auth.service.ts:91`, phải sửa cả USER lẫn Swagger. |
| 10 | POST /auth/login/user-code | STILL BUG (data) | Student/parent seed có `userCode` NULL. `USER/scripts/seed-user.ts:102-110` khai báo `ABC123`/`ABC456` nhưng không ghi field khi insert. Chạy lại seed không sửa được. |

### Admin

| # | Route | Trạng thái | Ghi chú |
|---|---|---|---|
| 18 | POST /admin/tutors | Hash: FIXED (source). Role: STILL BUG | Response không còn hash. Gateway không gửi `role`, USER mặc định STUDENT (`user.service.ts:153`). Tạo "tutor" ra STUDENT. NOT RETESTED live. |
| 19 | GET /admin/tutors | STILL BUG | Trả cả STUDENT, PARENT, ADMIN (đã xác nhận: 6 dòng, đủ 4 role). Gateway forward query không có filter role (`admin.controller.ts:142`). |
| 20 | GET /admin/tutors/:id | FIXED | ADMIN 200. Gateway gửi `{userId}` tới `user.getDetailUser`. |
| 21 | PUT /admin/tutors/:id | FIXED (source) | Response qua `omitPassword`. Probe UUID ngẫu nhiên trả 400, không leak. NOT RETESTED với user thật. |
| 23 | POST /admin/students | Hash: FIXED (source). NOT RETESTED live | Giống #18 về hash. |
| 25 | GET /admin/students/:id | FIXED | ADMIN 200. |
| 26 | PUT /admin/students/:id | NOT RETESTED | `parentId` không tồn tại gây 500 với SQL thô, chưa kiểm chứng lại. |

### Classes

| # | Route | Trạng thái | Ghi chú |
|---|---|---|---|
| 38 | POST /classes | NOT RETESTED (mutation) | Payload đã khớp `{data}` với tutor-service. Nguyên nhân 500 gốc không thấy qua source; đã sửa lỗi ngày tháng (`toDate`) và seed tạo class thành công. |
| 39 | PUT /classes/:id | NOT RETESTED (mutation) | Payload `{userId,id,data}` đã khớp. |
| 41 | GET /classes?limit=5 | FIXED | `pagination.limit = 5`. |
| 43 | POST /classes/:id/students | NOT RETESTED (mutation) | Payload `{userId,classId,data}` đã khớp. |
| 44 | GET /classes/:id/students | CHANGED | Hết 400 `CLASS_ID_MUST_BE_UUID` (đã sửa `classId`→`id`). TUTOR không sở hữu lớp nào nên owner path chưa test được. |
| 45 | GET /classes/:id/materials | CHANGED | Như #44. |
| 46 | GET /classes/:id/watches | CHANGED | Như #44. |

### Curriculum / lessons / exercises / schedules / sessions

| # | Route | Trạng thái | Ghi chú |
|---|---|---|---|
| 49 | POST /curriculum | NOT RETESTED (mutation) | Payload đã sửa thành `createCurriculum`. Còn lỗi FK khi `gradesId` không tồn tại → 500 (lỗi thật, chưa sửa). |
| 50 | GET /curriculum | FIXED | 200 với `curriculums`. |
| 51 | GET /curriculum/:id | Không kiểm tra lại trong lượt này | |
| 55 | GET /curriculum/lessons | FIXED | Lead xác nhận: 200; `chapterId=not-a-uuid` → 422. Nguyên nhân: `LessonModule` bị `/curriculum/:id` che, đã đổi thứ tự đăng ký. |
| 59 | POST /exercises | NOT RETESTED (mutation) | Payload đã khớp `{data}`. |
| 60 | GET /exercises | FIXED | 200. |
| 70–71 | POST /schedules, /bulk | NOT RETESTED (mutation) | Payload đã khớp `{data}`. |
| 72 | GET /schedules | FIXED | 200. |
| 77–78 | POST /sessions, /bulk | NOT RETESTED (mutation) | Payload đã khớp `{data}`. Cột `timestamp` đã sửa bằng `toDate`. |
| 79 | GET /sessions | FIXED | 200. |

### Students / tuitions / notifications

| # | Route | Trạng thái | Ghi chú |
|---|---|---|---|
| 84 | GET /students/get-student-code | STILL BUG | 400 `Trường không được hỗ trợ: undefined`. Gateway gọi `user.getUserByField({})` (`student.controller.ts:43`). USER không có RPC sinh mã (endpoint chỉ là HTTP trong USER). Cần thêm RPC. |
| 85 | POST /students | NOT RETESTED | Báo cáo gốc: 400 "Failed to hash data". Chưa kiểm chứng lại. |
| 87 | GET /students/:id | Source đã sửa, NOT RETESTED live | Đổi sang `user.getDetailUser`. |
| 91–93 | GET /tuitions, /summary, /:id | FIXED | ADMIN 200; `/summary` trả `totalUnpaid`. Gateway đã thêm `userId`. |
| 64 | POST /notifications | FIXED | `senderId` lấy từ JWT. Message validation không còn nhắc `senderId`. Message `userId` tiếng Anh còn ở `notification.schema.ts:15` (không bắt buộc). |
| 65 | GET /notifications | FIXED | 200; `isRead=bogus` → 422. |

### Logs / test-scenario / upload / ai-chat

| # | Route | Trạng thái | Ghi chú |
|---|---|---|---|
| 98–99 | GET /logs, /logs/trace/:id | FIXED | 200. Đã thêm cột `request_headers`, `response_headers`, `host`. |
| 106 | POST /test-scenarios/generate | FIXED | 200. Build cũ đã được khắc phục (134 route đang chạy khớp source). |
| 107 | POST /test-scenarios/bulk | NOT RETESTED (mutation) | |
| 109 | GET /test-scenarios/fixtures | FIXED | 200 (ADMIN). Bảng `test_fixtures` đã tạo. |
| 110–121 | POST/PATCH/DELETE test-scenarios | NOT RETESTED (mutation) | GET và cột `auth_profile` đã sửa. |
| 122 | POST /upload | STILL BUG (text-only) | Multipart không có file → 500 `reading 'originalname'` (`upload.controller.ts:60`, không kiểm tra `file`). Field sai → 400 đúng. Upload PNG thật NOT RETESTED (ghi R2). |
| 123 | POST /upload/multiple | STILL BUG | Multipart không có `files` → 201 `data: []` (`upload.controller.ts:84-86`). |
| 124 | GET /upload/download | FIXED (thiếu key) / STILL BUG (object không tồn tại) | Thiếu key → 400. Key không tồn tại → 500 `The specified key does not exist.` cần map sang 404. |
| 125 | DELETE /upload/:key | STILL BUG | Key không tồn tại → 500 "no elements in sequence". |
| 128 | GET /users/get-by-field | FIXED | Không còn `password` trong response. |
| 28 | POST /ai-chat/chat | NOT RETESTED | `{}` → 422 trước khi gọi LLM. Timeout RMQ mặc định 10s × 3 lần ≈ 30s; cần thêm timeout phù hợp. Không chạy vì gọi LLM tốn chi phí. |
| 32 | PUT /attendances | NOT RETESTED (mutation) | Payload `{userId,data}` đã khớp (`attendance.controller.ts:53`). |
| 33 | POST /chapter/:curriculumId | STILL BUG | Xem mục 2. |

## 4. Chưa kiểm chứng và lý do

- **Ghi dữ liệu (mutation):** mọi route POST/PUT/DELETE hợp lệ. Các route này cần bản ghi dùng riêng để test; lượt này chỉ đọc source.
- **Owner path:** TUTOR (`chienbinhthephai@gmail.com`) không sở hữu lớp nào trong DB, nên kiểm tra owner cần dữ liệu seed riêng.
- **Upload PNG thật, AI chat:** có chi phí/side effect bên ngoài.
- **Swagger mismatch:** không thuộc phạm vi lượt này.

## 5. Lỗi ngoài gateway

| Thành phần | Lỗi | Trạng thái |
|---|---|---|
| `USER/scripts/seed-user.ts:102-110` | Không ghi `userCode` dù khai báo | STILL BUG |
| `USER/src/features/user/user.service.ts:153` | `role ?? 'STUDENT'` cho cả tạo tutor/admin | STILL BUG |
| `USER/src/features/auth/auth.service.ts:91` | Sai mật khẩu trả 400 thay vì 401 | STILL BUG |
| `tutor-service` chapter service | Không kiểm tra curriculum tồn tại | STILL BUG |
| `tutor-service` curriculum service | FK khi `gradesId` không tồn tại → 500 | STILL BUG |
| `THIRD_SERVICE` notification service | `findById`/`markAsRead`/`delete` không kiểm tra owner | STILL BUG |
| `THIRD_SERVICE` redis | `redis.get` trả mọi key session | STILL BUG |
| Seed dữ liệu | Đã có class, curriculum, chapter, lesson, session, exercise, schedule, tuition, notification mẫu (chạy `USER/scripts/seed-edu-flow.ts`) | Đã sửa |

## 6. Sự cố trong lúc kiểm chứng (ghi chép)

Các request ghi thực sự được gửi trong lượt này, cần biết để kiểm tra DB:

1. `PUT /users` dưới tài khoản STUDENT với `{"role":"ADMIN"}`: HTTP 200, role vẫn STUDENT trong DB, nhưng `updated_at` của `student@finance.dev` đã đổi thành 03:17:28 (dòng bị lưu lại).
2. `POST /chapter/<UUID ngẫu nhiên>` dưới tài khoản STUDENT: lỗi FK, không có dòng nào được ghi (FK chặn ở DB).
3. `POST /test-scenarios/generate` với `{}`: chỉ đề xuất, không lưu gì.
4. Các probe `PUT`/`DELETE` với UUID ngẫu nhiên: trả 400/404, không thay đổi dữ liệu.

Lưu ý thêm: `request_logs` ghi status 201 cho một số POST thực ra bị 422. Log này không đáng tin để debug lỗi validation; `test_runs` ghi đúng.

## 7. Cách tái hiện

- Kiểm tra quyền: `GET /students`, `GET /users`, `GET /redis?key=session:<admin id>` bằng token STUDENT.
- Chi tiết request/response từng route: `docs/api-review/gateway.md`.
