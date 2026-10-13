# Review tutor-service (vòng 3)

Repo được review: `/home/haidangphan/Documents/tutor/tutor` (branch `chore/sync-2026-10-11`, HEAD `4581e83 fixbug`, working tree sạch, còn `stash@{0}` WIP).
Lưu ý: hai báo cáo cũ (`gateway/reviews/round2/tutor-review.md`, `gateway/reviews/tutor-review.md`) trỏ tới `D:\projects\tutor` và `/home/haidangphan/Documents/project/tutor-service`, không phải đường dẫn này. Mọi mục cũ được đối chiếu lại trên code hiện tại, không tin báo cáo cũ.

Cách kiểm chứng:
- Đọc toàn bộ `src/features/*` (service, repository, rpc controller, schema Zod), `src/packages/*` (guard, filter, interceptor, config), `src/main.ts`, `app.module.ts`, và đối chiếu payload với `gateway/src/features/*`.
- `tsc --noEmit` trên repo: lỗi `TS1185` (3 lỗi, merge conflict). Trên bản sao trong scratchpad đã bỏ marker (giữ nhánh "Stashed changes"): `tsc` exit 0.
- Đọc `node_modules/@nestjs/core/nest-application.js` (connectMicroservice không kế thừa APP_GUARD khi không có `inheritAppConfig`), `node_modules/@nestjs/microservices/constants.js` (`RQM_DEFAULT_NOACK = true`), `node_modules/@nestjs/microservices/context/rpc-context-creator.js`.
- Đọc `node_modules/drizzle-orm/sql/sql.js` (mảng rỗng trong `sql` template → `()`), `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` (dạng message SDK).
- Chưa chạy DB, RabbitMQ, test hay gateway thật. Các mục "chưa xác minh" ghi rõ.

## 1. Tóm tắt

Tổng: **47 bug** còn tồn tại (1 Critical, 7 High, 23 Medium, 16 Low).

| Mức độ | Số lượng | MỚI | CÒN TỒN TẠI từ round2 |
|---|---|---|---|
| Critical | 1 | 0 | 1 |
| High | 7 | 1 | 6 |
| Medium | 23 | 2 | 21 |
| Low | 16 | 4 | 12 |
| **Tổng** | **47** | **7** | **40** |

Trạng thái các mục round2 (50 mục TUT2-01..50, gồm cả mục cũ TUT-01..33):
- **ĐÃ SỬA hoàn toàn: 11** (TUT2-01, 02, 03, 06, 18, 20, 31, 32, 33, 34, 43; TUT-22 cũng đã sửa). Chi tiết ở Phụ lục A.
- **ĐÃ SỬA MỘT PHẦN, phần còn lại được ghi thành bug TUT3 mới: 7** (TUT2-04, 05, 09, 11, 40, 41, 42).
- **CÒN TỒN TẠI: 32** (đã gộp vào các bug TUT3 tương ứng, xem Phụ lục A).

Nhận định chính:
1. Đã vá phần lớn lỗ hổng round2 về sở hữu (curriculum/chapter/lesson, class create, tuition read, class read), về `.default()` trong `.partial()`, về ngày qua RPC (`toDate`), về secret JWT fallback và về chat join/typing.
2. Mới nghiêm trọng nhất: **repo không build** do merge conflict đã commit trong `chapter.service.ts` (TUT3-02), và **RPC không có lớp xác thực** nên mọi kiểm tra quyền dựa hoàn toàn vào `userId` trong payload (TUT3-01).
3. Vẫn còn nhiều rò PII (email, phone của học sinh và phụ huynh) qua các endpoint đọc lớp và học phí (TUT3-04, TUT3-05), và log lưu `DATABASE_URL` có mật khẩu (TUT3-06).

## 2. Bảng bug

Ký hiệu đường dẫn: `T/` = `/home/haidangphan/Documents/tutor/tutor/src/`. Dòng là dòng hiện tại.

| ID | Mức độ | Trạng thái | File:dòng | Mô tả ngắn | Cách tái hiện / kịch bản | Đã xác minh |
|---|---|---|---|---|---|---|
| TUT3-01 | Critical | CÒN TỒN TẠI (round2 "Cần xác minh" + TUT-15 mục 5) | `T/main.ts:39-47`; `node_modules/@nestjs/core/nest-application.js:129-133`; `T/features/*/*.rpc.controller.ts` | Handler RPC không có JwtAuthGuard; tin tưởng `userId` trong payload; `report.*` không kiểm ADMIN ở tầng RPC | Ai publish được vào `tutor_queue` gửi `{userId: <uuid bất kỳ>}` tới `class.delete`, `tuition.getAll`, `report.summary`. Điều kiện: broker truy cập được (docker-compose publish 5672/15672, user mặc định admin/admin) | Đã xác minh cơ chế (đọc Nest). Chưa xác minh triển khai broker thực tế |
| TUT3-02 | High | MỚI | `T/features/chapter/chapter.service.ts:45-51` | Có marker merge conflict `<<<<<<<`, `=======`, `>>>>>>>` trong file đã commit (có ở `HEAD`) | `tsc` báo TS1185 x3; `bun run build`/`nest build` lỗi; service không biên dịch, không deploy được từ HEAD | Đã xác minh (tsc repo lỗi; bản sao bỏ marker tsc exit 0) |
| TUT3-03 | High | CÒN TỒN TẠI (TUT2-07, phần tool) | `T/features/agents/agents.service.ts:21-37` | `query()` không khoá tool, `permissionMode`, `cwd`; prompt là nội dung người dùng | Prompt injection kích hoạt tool đọc file trong thư mục service (`.env`, source) nếu SDK mặc định cho phép tool đọc | Chưa xác minh (mặc định tool/permission của SDK khi headless chưa chạy thử) |
| TUT3-04 | High | CÒN TỒN TẠI (TUT2-49; TUT2-34 phần PII) | `T/features/class/class.repository.ts:240-263` (`getClass`), `:355-381` (`getAllStudent`); `T/features/class/class.service.ts:294-316` | Học sinh đã ghi danh và phụ huynh của học sinh trong lớp thấy email, phone của học sinh cùng lớp; `getAllStudent` còn trả email, phone, quan hệ của phụ huynh từng học sinh | `class.getById`, `class.getWatch`, `class.getStudents` với tài khoản học sinh/phụ huynh trong lớp | Đã xác minh (đọc câu select) |
| TUT3-05 | High | CÒN TỒN TẠI (TUT2-08; TUT-10) | `T/features/tuition/tuition.service.ts:16-26`; `T/features/tuition/tuition.repository.ts:65-79, 112-121, 40-63` | `tuition.create` không kiểm `studentId` tồn tại hoặc ghi danh lớp; kết quả trả `findById` kèm firstName, lastName, phone, avatar của user đó | Tutor gửi `studentId` = UUID của người ngoài lớp → nhận phone/avatar của họ. UUID không tồn tại → FK 23503 → 500 | Đã xác minh (code; FK theo `schema.ts`) |
| TUT3-06 | High | CÒN TỒN TẠI (TUT2-39) | `T/database/database.module.ts:60` | `logger.log('this connection:', databaseUrl)` ghi cả `DATABASE_URL` có mật khẩu vào log khi khởi động | Mọi lần boot service, log chứa mật khẩu Postgres | Đã xác minh (đọc code) |
| TUT3-07 | High | CÒN TỒN TẠI (TUT2-19) | `T/features/class/class.service.ts:250-266`; `T/features/class/class.repository.ts:265-268` | `delClass` xoá cứng lớp, cascade tuitions, attendances, sessions, schedules, class_students; không xác nhận, không chặn khi còn học phí chưa thu | Tutor xoá nhầm lớp → mất toàn bộ lịch sử học phí và điểm danh, không khôi phục | Đã xác minh (onDelete cascade của tuitions.classId và attendances trong `schema.ts`) |
| TUT3-08 | High | CÒN TỒN TẠI (TUT2-28) | `scripts/recreate-db.ts:39,51` | Script DROP TABLE/TYPE toàn schema `public` (DB dùng chung 4 service), không có guard `NODE_ENV` hay xác nhận | Chạy nhầm trên staging/prod → xoá dữ liệu mọi service | Đã xác minh (grep `NODE_ENV` = 0 kết quả) |
| TUT3-09 | Medium | CÒN TỒN TẠI (TUT2-34, phần materials) | `T/features/class/class.service.ts:270-289`; `T/features/class/class.repository.ts:272-289` | `class.getMaterials` cho học sinh xem `exerciseUrls` của mọi bài học trong giáo trình, bỏ qua `gateExercises` (chỉ mở khi buổi COMPLETED) | Học sinh đã ghi danh gọi `class.getMaterials` trước khi buổi học kết thúc → thấy bài tập | Đã xác minh (code) |
| TUT3-10 | Medium | CÒN TỒN TẠI (TUT2-04, phần message:read) | `T/features/chat/message.service.ts:92-100`; `T/features/chat/chat.gateway.ts:207-226` | `updateMessageStatus(messageId)` không ràng buộc `conversationId`; `message:read` chỉ kiểm tra participant của conversation gửi lên | Thành viên hội thoại A gửi `message:read` với `messageId` của hội thoại B → tin của B bị đặt READ | Đã xác minh (code) |
| TUT3-11 | Medium | CÒN TỒN TẠI (TUT2-37) | `T/features/chat/conversation.service.ts:193-234` | `createClassConversation` không kiểm người gọi thuộc lớp; tạo conversation và participants trước, rồi `getConversationById` mới ném 403; không có unique `(classId, type)` | Người lạ gọi `POST /chat/conversations/class/:id` → hội thoại được tạo rồi nhận 403. Hai request đồng thời tạo hai hội thoại | Đã xác minh (code) |
| TUT3-12 | Medium | CÒN TỒN TẠI (TUT2-16, TUT-19) | `T/features/chat/conversation.service.ts:174-191` (group), `:236-273` (addParticipant) | Group không gọi `validateChatPermission`, không kiểm tồn tại và không dedupe `participantIds` (trùng → unique violation 500). `addParticipant` cho mọi thành viên thêm user bất kỳ vào DIRECT/CLASS, không kiểm user tồn tại | Học sinh tạo nhóm với admin/phụ huynh bất kỳ; thành viên DIRECT thêm người thứ ba; `participantIds` có id trùng → 500 | Đã xác minh (code; unique index `conversation_participants_unique` trong schema) |
| TUT3-13 | Medium | CÒN TỒN TẠI (TUT2-36) | `T/features/chat/conversation.service.ts:691-700, 757-766` (danh sách) so với `:413-464` (kiểm tra); `:466-506` (`limit(1)` ở `:482`) | Danh sách cho STUDENT/PARENT có ADMIN nhưng `validateChatPermission` ném 403; PARENT nhiều con chỉ xét con đầu tiên; TUTOR↔TUTOR được validate nhưng không liệt kê | UI hiện admin, bấm tạo chat báo 403; phụ huynh 2 con bị từ chối nếu con đầu không thuộc lớp của tutor | Đã xác minh (code) |
| TUT3-14 | Medium | CÒN TỒN TẠI (TUT2-35) | `T/features/chat/conversation.service.ts:589-605` (và `:616`) | Nhánh TUTOR: lớp có nhưng chưa có học sinh → `IN ${[]}` sinh `IN ()` | `GET /chat/users` của tutor mới → lỗi SQL 500 | Đã xác minh (drizzle `sql.js`: mảng rỗng → `()`) |
| TUT3-15 | Medium | CÒN TỒN TẠI (TUT2-17) | `T/packages/filters/rpc-exception.filter.ts:49-57` | Lỗi không phải `HttpException` (pg/drizzle) trả `statusCode` 500 và `message` gốc (có SQL, tham số); FK 23503 và unique 23505 không map sang 4xx | Gửi `tuition.create` với studentId không tồn tại → client nhận câu SQL và 500 | Đã xác minh (code) |
| TUT3-16 | Medium | CÒN TỒN TẠI (TUT2-10, TUT2-40; TUT-13) | `T/features/session/session.service.ts:167-178` và `session.repository.ts:221-247`; `T/features/lesson/lesson.service.ts:33-51, 72-91`; `T/features/class/class.service.ts:107-147` và `class.repository.ts:62-82`; `T/features/session/session.service.ts:26-48` | (a) `session.update` không gọi `resolveSessionRefs`: lessonId/tutorId không kiểm tra. (b) lesson create/update nhận `chapterId` của giáo trình khác. (c) `curriculumId` của class không kiểm tồn tại. (d) `session.tutorId` chỉ kiểm tra tồn tại, có thể gán STUDENT | (a) `session.update {lessonId: <uuid không tồn tại>}` → FK 500. (b) chapter của giáo trình B gắn vào lesson của A. (c) `class.update {curriculumId: <sai>}` → FK 500 | Đã xác minh (code + FK trong schema) |
| TUT3-17 | Medium | CÒN TỒN TẠI (TUT2-12; TUT-15) | `T/main.ts:39-47`; `node_modules/@nestjs/microservices/constants.js:23` (`RQM_DEFAULT_NOACK = true`) | Listener RMQ dùng noAck mặc định (true): message được ack khi giao, crash giữa chừng là mất lệnh. Gateway retry 2 lần với lệnh ghi không idempotent | `session.create` chậm >10s: gateway gửi lại, bản đầu vẫn chạy → bản ghi trùng | Đã xác minh (hằng số Nest). Phần retry ở gateway (không thuộc repo này) |
| TUT3-18 | Medium | CÒN TỒN TẠI (TUT2-13; TUT2-41 phần class) | `T/features/class/class.repository.ts:161-166` (không orderBy), `:141-143` (ADMIN rơi vào `tutorId = userId`); `T/features/report/report.repository.ts:124` (orderBy createdAt không duy nhất) | Phân trang lớp không ổn định; ADMIN thấy danh sách rỗng | Trang 2 trùng/thiếu lớp; ADMIN `GET /classes` rỗng | Đã xác minh (code) |
| TUT3-19 | Medium | CÒN TỒN TẠI (TUT2-14) | `T/features/session/session.repository.ts:79-151` (getAll không có PARENT), `T/features/session/session.service.ts:137-143` (getByClass owner-only), `T/features/schedule/schedule.service.ts:55-72` và `schedule.repository.ts:60-120` | Quyền đọc không nhất quán: PARENT không thấy session/schedule/học phí của con; học sinh gọi `getByClass`/`getById` lịch → 404 | PARENT `GET /sessions` rỗng; HS `GET /schedules/class/:id` → 404 | Đã xác minh (code) |
| TUT3-20 | Medium | CÒN TỒN TẠI (TUT2-15) | `T/features/class/class.service.ts:137-147`; `T/features/class/class.repository.ts:86-100` | `syncStudents` (xoá/thêm học sinh) chạy trước `repo.update`, không transaction; `studentIds: []` xoá toàn bộ học sinh không cảnh báo | `update` lỗi sau sync (ví dụ curriculumId sai) → học sinh đã đổi, thông tin lớp không đổi | Đã xác minh (code) |
| TUT3-21 | Medium | CÒN TỒN TẠI (TUT2-01, phần role giáo trình) | `T/features/curriculum/curriculum.service.ts:38-52`; gateway `curriculum.controller.ts` không có `@Roles` | `createCurriculumService` chỉ kiểm user tồn tại, không kiểm role; STUDENT tạo được giáo trình trong thư viện chung | STUDENT `POST /curriculum` thành công | Đã xác minh (code) |
| TUT3-22 | Medium | CÒN TỒN TẠI (TUT2-47, TUT2-21) | `T/packages/entities/curriculum/curriculum.schema.ts:18` (`union(string,number).transform(Number)`); `T/features/curriculum/curriculum.repository.ts:27, 29`; `T/database/schema.ts:232` (`grade varchar(2)`) | `grade: 'abc'` → NaN → `'NaN'` (3 ký tự) vượt `varchar(2)`; `grade: 100` cũng vượt. `gradesId` client gửi bị bỏ, ghi `null` | `POST /curriculum {grade:'abc'}` → 500 từ DB | Đã xác minh (code; độ dài cột theo schema) |
| TUT3-23 | Medium | CÒN TỒN TẠI (TUT2-09) | `T/features/tuition/tuition.service.ts:48-63`; `T/features/tuition/tuition.repository.ts:123-137` | Không có state machine: PAID→UNPAID, sửa `amount` khi đã PAID; không có chỗ nào chuyển UNPAID→OVERDUE (chỉ có enum) | Tutor đổi bản đã thu về UNPAID; báo cáo doanh thu mất bản ghi. Học phí quá hạn không bao giờ thành OVERDUE | Đã xác minh (grep OVERDUE: không có job) |
| TUT3-24 | Medium | CÒN TỒN TẠI (TUT2-11) | `T/packages/entities/session/session.schema.ts:23-42`; `T/packages/entities/schedule/schedule.schema.ts:27-34`; `T/packages/entities/class/class.schema.ts:6-33` | Không kiểm `endAt > startAt`, `endTime > startTime`, `endTime != startTime`. Regex giờ đã sửa (`[01]\d|2[0-3]`) | `POST /sessions {startAt: 10:00, endAt: 09:00}` được lưu | Đã xác minh (schema) |
| TUT3-25 | Medium | MỚI | `T/features/report/report.repository.ts:45-62, 130-186` | Chỉ số "tỷ lệ điểm danh" tính từ trạng thái session (COMPLETED/(COMPLETED+CANCELLED)), không dùng bảng `attendances` | Lớp có điểm danh đầy đủ nhưng báo cáo vẫn 100% nếu buổi COMPLETED. Ý đồ chưa xác nhận | Đã xác minh (code); ý đồ chưa xác nhận |
| TUT3-26 | Medium | CÒN TỒN TẠI (TUT2-05) | `T/features/exercise/exercise.service.ts:66-109` | Khi không có `sessionId`: không kiểm học sinh có ghi danh, không chống trùng. Tutor có thể tạo bài nộp cho user bất kỳ (chỉ kiểm tồn tại) rồi tự chấm (`:172`) | Tutor gửi `studentId` = người ngoài lớp → bài nộp và điểm do chính tutor tạo | Đã xác minh (code) |
| TUT3-27 | Medium | CÒN TỒN TẠI (TUT2-45) | `T/packages/guards/jwt-auth.guard.ts:101-107`; `T/features/chat/chat.gateway.ts:72-76`; `T/database/schema.ts:86` (`isActive`) | JWT guard và WS chỉ kiểm user tồn tại, không kiểm `isActive`; CORS `origin: true, credentials: true` | Tài khoản bị khoá vẫn gọi API/nối chat đến khi token hết hạn | Đã xác minh (code) |
| TUT3-28 | Medium | CÒN TỒN TẠI (TUT2-23, phần HTTP) | `T/features/chat/chat.controller.ts:85-86, 92, 105, 129`; `T/features/curriculum/curriculum.controller.ts:72, 145` | Route HTTP (cổng 8888) không validate: `limit` NaN/âm không clamp, `before` không UUID → lỗi 22P02, body không qua Zod (chat và curriculum) | `GET /chat/conversations/:id/messages?limit=abc` → 500. Mức phơi lộ phụ thuộc cổng 8888 có public hay không | Đã xác minh (code). Chưa xác minh cổng 8888 có phơi ra ngoài |
| TUT3-29 | Medium | MỚI | `T/packages/interceptor/trace-context.interceptor.ts:22-30, 142, 185-186` | Log RPC (`log.create` tới third-service) lưu preview request và response (tới 1000 ký tự). `SENSITIVE_KEYS` không có email/phone | `class.getStudents`, `tuition.create` ghi email, phone vào `request_logs` | Đã xác minh (code). Chưa kiểm third-service lưu/hiển thị ra sao |
| TUT3-30 | Medium | CÒN TỒN TẠI (TUT2-06, phần quota) | `T/features/agents/agents.controller.ts:10-16` | `POST /run` đã bỏ `@Public()` nhưng không throttle; mỗi lần là một phiên Claude SDK với prompt cố định | Mọi user đăng nhập (kể cả STUDENT) gọi lặp → tốn chi phí LLM | Đã xác minh (code) |
| TUT3-31 | Medium | CÒN TỒN TẠI (TUT2-07, phần reply; TUT2-38) | `T/features/agents/agents.service.ts:39-47` (reply), `:40` (không gửi lịch sử), `:17, 73-79` (history RAM) | `'text' in message` không khớp kiểu SDK (`SDKAssistantMessage` có `message.content`, `SDKResultSuccess` có `result`) → reply luôn là "Không có phản hồi từ trợ lý."; model không nhận ngữ cảnh; lịch sử mất khi restart | `POST /ai-chat` luôn trả câu mặc định; hỏi tiếp "còn câu hai?" không có ngữ cảnh | Đã xác minh (đọc `sdk.d.ts` dòng 3602-3612, 5671-5703) |
| TUT3-32 | Low | CÒN TỒN TẠI (TUT2-24) | `T/features/chat/chat.gateway.ts:40, 82-84, 95-96` | `onlineUsers: Map<userId, socketId>`: một socket mỗi user; đóng tab cũ phát `offline` dù tab mới còn; `user:status` broadcast cho mọi client | Trạng thái online chập chờn | Đã xác minh (code) |
| TUT3-33 | Low | CÒN TỒN TẠI (TUT2-26) | `T/features/dashboard/dashboard.service.ts:56-68`; `T/features/dashboard/dashboard.repository.ts:74-75`; `dashboard.service.ts:36-46` | PARENT/ADMIN dùng `tutorClassScope` → toàn số 0. Mốc ngày dùng `setHours` theo giờ máy chủ | Dashboard phụ huynh trống; lệch ngày nếu server UTC | Đã xác minh (code) |
| TUT3-34 | Low | CÒN TỒN TẠI (TUT2-27) | `T/app.controller.ts:28-41` | Handler thử nghiệm `tutor.test` và `kafka.tutor` (luôn ném 400) còn trong production | Gửi `kafka.tutor` tới queue → lỗi 400, rác log | Đã xác minh (code) |
| TUT3-35 | Low | CÒN TỒN TẠI (TUT2-25) | `T/features/attendance/attendance.service.ts:29-57` (`present: record?.present ?? false` ở `:52`), `:65-79` | Học sinh/phụ huynh thấy điểm danh cả lớp (tên, userCode, avatar). Chưa điểm danh hiện như vắng. Cho điểm danh buổi CANCELLED | Học sinh xem tên và trạng thái bạn học | Đã xác minh (code) |
| TUT3-36 | Low | CÒN TỒN TẠI (TUT2-29) | `T/features/exercise/exercise.service.ts:129-166`; `T/features/report/report.repository.ts:75, 166` | Enum `RESUBMIT` không đường nào đặt; bài GRADED không nộp lại được; `submissionRate` đếm `<> 'RESUBMIT'` vô nghĩa | Tutor không yêu cầu làm lại bài | Đã xác minh (code) |
| TUT3-37 | Low | CÒN TỒN TẠI (TUT2-22) | `T/features/chapter/chapter.service.ts:63-68`; `T/features/lesson/lesson.service.ts:65-70`; `T/features/curriculum/curriculum.service.ts:76-87` | `getById` trả `null` (HTTP 200) khi không tồn tại, lệch với update/delete (404) | Client không phân biệt được "không có" | Đã xác minh (code) |
| TUT3-38 | Low | CÒN TỒN TẠI (TUT2-44) | `T/database/schema.ts` (527 dòng); `T/database/database.module.ts:6` | Bản schema cục bộ vẫn được runtime import, đã lệch gateway (thiếu `test_auth_profile`, `test_fixtures`, cột `expected_message`, `auth_profile`, `response_body`, `request_path`). CLAUDE.md nói không có bản local | Dev sửa nhầm file này | Đã xác minh (diff với `gateway/src/database/schema.ts`) |
| TUT3-39 | Low | CÒN TỒN TẠI (TUT2-48, TUT2-23) | `T/features/chat/chat.gateway.ts:101-132`; `T/features/chat/message.service.ts:58-90` | `message:send` không validate `content` (rỗng, rất dài), không rate limit; `conversationId` không kiểm UUID | Chuỗi rỗng hoặc rất dài được lưu | Đã xác minh (code) |
| TUT3-40 | Low | CÒN TỒN TẠI (TUT2-46) | `T/features/class/class.service.ts:145` (`repo.update` không bắt 23505); `:62-105` (create có bắt) | Update trùng `name`/`code` do race → 500 với SQL. Tên lớp unique toàn hệ thống, lộ sự tồn tại | `class.update {name: <tên tutor khác>}` cạnh tranh → 500 | Đã xác minh (code) |
| TUT3-41 | Low | MỚI | `T/packages/entities/class/class.schema.ts:45`; `T/features/class/class.service.ts` (không dùng `schedulesId`) | `schedulesId` được nhận ở create/update rồi bỏ qua, không lưu, không báo lỗi | Client nghĩ đã gán lịch, thực tế không | Đã xác minh (code) |
| TUT3-42 | Low | MỚI | `T/features/tuition/tuition.service.ts:60` | Khi `status` = PAID và không gửi `paidDate`, luôn ghi đè `paidDate = now()`, kể cả bản đã PAID từ trước | Đánh dấu lại PAID làm đổi ngày thu, lệch báo cáo theo tháng | Đã xác minh (code) |
| TUT3-43 | Low | MỚI | `T/features/user/user.service.ts:28-38` | `getUserByField` `select()` toàn bộ row `users` (có cột `password`), không ai gọi (dead code) | Nếu có người dùng về sau, hash mật khẩu lộ ra | Đã xác minh (grep: không có caller) |
| TUT3-44 | Low | CÒN TỒN TẠI (TUT2-30) | `API_ENDPOINTS.md:190` | Tài liệu mô tả payload `{name, subject?, maxStudents?, startDate?, endDate?}`; schema thật dùng `code`, `subject`, `startTime`, `endTime`, `tutorId` | Client đọc tài liệu gửi sai payload | Đã xác minh (so với `class.schema.ts`) |
| TUT3-45 | Low | CÒN TỒN TẠI (TUT2-42, phần test) | `package.json:22`; `.claude/rules/conventions.md` (nhắc `test/packages/entities/update-schemas.spec.ts`) | `test:e2e` trỏ `test/jest-e2e.json` không tồn tại; spec về update schema được nhắc nhưng không có. Không có test contract RPC | CI không bắt được regression ở TUT3-02, TUT3-22, TUT3-31 | Đã xác minh (kiểm file) |
| TUT3-46 | Low | CÒN TỒN TẠI (TUT2-50) | `T/features/tuition/tuition.repository.ts:123-137` | `update(id, data: Record<string, unknown>)` spread nguyên `rest`, không whitelist; RPC không validate lại. Qua broker có thể đổi `classId`/`studentId` | Payload trực tiếp đổi tuition sang lớp khác | Đã xác minh (code); khai thác cần broker (TUT3-01) |
| TUT3-47 | Low | MỚI | `T/features/exercise/exercise.repository.ts:134-148`; `T/features/session/session.repository.ts:189` | `exercise.findAll` trả khoá `data` thay vì tên resource (trái quy ước rules); `getDetailById` join `users` không dùng | Chất lượng code, client phải biết khoá đặc biệt | Đã xác minh (code) |

## 3. Chi tiết từng bug

### TUT3-01 (Critical) RPC không có xác thực, tin tưởng `userId` từ payload
- Ghi nhận: `connectMicroservice(..., {deferInitialization: true})` không truyền `inheritAppConfig`, nên Nest tạo `new ApplicationConfig()` riêng cho microservice (`nest-application.js:129-133`). `APP_GUARD` (`JwtAuthGuard`, `LanguageGuard` trong `app.module.ts`) được đăng ký vào config của app, không vào microservice. Vì vậy `@MessagePattern` không chạy guard xác thực.
- Hệ quả: mọi kiểm tra quyền dựa vào `userId` trong payload do gateway gửi. Không có chỗ nào ở tutor kiểm `userId` có thật. `report.summary`, `report.attendanceTrend`, `report.classList` không kiểm ADMIN (gateway có `@Roles('ADMIN')`).
- Điều kiện khai thác: người có quyền publish vào `tutor_queue`. `docker-compose.yml` publish cổng 5672 và 15672 với user/pass mặc định `admin/admin`. Triển khai thực tế chưa kiểm.
- Đề xuất: TLS và credential riêng cho broker, không publish cổng ra ngoài; thêm kiểm role/`userId` ở tầng RPC (guard hoặc pipe) hoặc `inheritAppConfig` có chủ đích; kiểm ADMIN ở `report.*`.

### TUT3-02 (High) Merge conflict đã commit trong `chapter.service.ts`
- `src/features/chapter/chapter.service.ts:45` (`<<<<<<< Updated upstream`), `:47` (`=======`), `:51` (`>>>>>>> Stashed changes`). Có trong `HEAD` (`git show HEAD:...`). `git stash list` còn `stash@{0}` WIP trên cùng branch.
- `tsc --noEmit` trên repo: TS1185 x3. Bản sao trong scratchpad bỏ marker (giữ nhánh Stashed, cả hai nhánh đều gọi kiểm tra curriculum) có `tsc` exit 0, nên chỉ cần xoá marker và chọn một nhánh.
- Đề xuất: giữ `assertCurriculumOwner` (nhánh Updated upstream) vì đã kiểm chủ sở hữu, bỏ nhánh còn lại.

### TUT3-03 (High, chưa xác minh) Agent không khoá tool
- `agents.service.ts:24-30`: `query({prompt, options: {model, ...options}})`, không có `allowedTools`, `disallowedTools`, `permissionMode`, `cwd`, `maxTurns`. Prompt là `data.message` của người dùng (`:40`).
- `sdk.d.ts` có `allowedTools`/`disallowedTools`/`permissionMode`, nhưng mặc định khi headless chưa chạy thử. Nếu tool đọc file được bật với cwd là thư mục service, prompt injection có thể đọc `.env` hoặc source. Hiện reply bị bỏ (TUT3-31) nên tác động thực tế nhỏ, nhưng sửa reply sẽ làm lộ nội dung.
- Đề xuất: `allowedTools: []`, `permissionMode: 'plan'` hoặc tương đương, `maxTurns`, timeout; test với prompt "đọc file .env".

### TUT3-04 (High) Lộ PII học sinh và phụ huynh qua đọc lớp
- `getClass` (`class.repository.ts:244-260`): trả `email`, `phone` của mọi học sinh trong lớp. Cho phép: owner, học sinh ghi danh, phụ huynh của học sinh (`class.service.ts:197-213`).
- `getAllStudent` (`class.repository.ts:355-381`): thêm `parent.email`, `parent.phone`, `parent.relationship`. Dùng cho `getAllStudentsService` và `getClassWatchService` (`class.service.ts:294-316`).
- Kịch bản: học sinh A ghi danh lớp L gọi `class.getStudents {id: L}`, nhận email/phone của B và của phụ huynh B.
- Đề xuất: với người không phải owner, chỉ trả hồ sơ rút gọn (tên, avatar); thông tin liên hệ chỉ cho tutor/admin.

### TUT3-05 (High) `tuition.create` không kiểm học sinh và trả PII
- `tuition.service.ts:16-26` chỉ kiểm owner của lớp. `tuition.repository.ts:65-79` không kiểm `studentId` có trong `class_students`. `:78` trả `findById(tuition.id)` với `firstName`, `lastName`, `phone`, `avatar` của học sinh (`:40-63`).
- Kịch bản: tutor T (owner lớp L) gửi `studentId` = UUID của user U không thuộc lớp, nhận phone và avatar của U. UUID không tồn tại → FK `23503` → 500 (TUT3-15).
- Đề xuất: kiểm `class_students` trước khi insert (404/400), không trả PII trong response create.

### TUT3-06 (High) `DATABASE_URL` có mật khẩu trong log
- `database/database.module.ts:60`: `logger.log('this connection:', databaseUrl)`. Với Nest `Logger.log(message, context)`, `databaseUrl` thành context và được in ra mỗi lần boot.
- Đề xuất: xoá dòng này, hoặc che mật khẩu bằng `new URL(...)`.

### TUT3-07 (High) Xoá lớp không kiểm công nợ, cascade lịch sử tài chính
- `delClassService` (`class.service.ts:250-266`) kiểm owner và xoá cứng. Schema: `tuitions.classId`, `attendances` (qua session), `sessions`, `schedules`, `class_students` đều `onDelete: cascade`.
- Đề xuất: soft delete (`status = CLOSED`), hoặc chặn khi còn tuition UNPAID/OVERDUE, yêu cầu xác nhận.

### TUT3-08 (High) Script DROP toàn schema không có guard
- `scripts/recreate-db.ts:39` (`DROP TABLE ... CASCADE`), `:51` (`DROP TYPE`). Không có kiểm `NODE_ENV` hoặc xác nhận tương tác.
- Đề xuất: từ chối khi `NODE_ENV=production` hoặc khi DB không phải local, yêu cầu gõ tên DB; hoặc xoá script.

### TUT3-09 (Medium) `getMaterials` bỏ qua gating bài tập
- `class.service.ts:270-289` gọi `loadAccessibleClass` (cho học sinh và phụ huynh), rồi `repo.getMaterials` trả `exerciseUrls` của mọi bài học giáo trình. `SessionService.gateExercises` (chỉ mở khi COMPLETED) không được áp dụng.
- Đề xuất: với non-owner, bỏ `exerciseUrls` hoặc chỉ trả bài đã có buổi COMPLETED.

### TUT3-10 (Medium) `message:read` đánh dấu READ chéo hội thoại
- `chat.gateway.ts:215`: `updateMessageStatus(data.messageId, 'READ')`. `message.service.ts:92-100` update theo `id` duy nhất, không có `conversationId`.
- Đề xuất: `where(id = messageId AND conversationId = conversationId)`.

### TUT3-11 (Medium) Tạo hội thoại lớp không kiểm thành viên
- `conversation.service.ts:193-234`: không kiểm người gọi là owner hoặc học sinh của lớp. Tạo `conversations` và `conversation_participants` trước, rồi `getConversationById` (`:233`) ném 403 cho người gọi.
- Không có unique `(classId, type)` nên hai request song song tạo hai hội thoại. Participant chụp một lần, không đồng bộ khi thêm/xoá học sinh.
- Đề xuất: kiểm thành viên trước khi insert; unique index và `onConflictDoNothing`; đồng bộ participant trong `addStudents`/`syncStudents`.

### TUT3-12 (Medium) Tạo nhóm và thêm thành viên không theo luật chat
- `createGroupConversation` (`:174-191`): không gọi `validateChatPermission`. `participantIds` không kiểm tồn tại (FK → 500) và không dedupe (trùng → vi phạm unique `conversation_participants_unique`).
- `addParticipant` (`:236-273`): mọi participant (kể cả DIRECT, CLASS) thêm `newUserId` bất kỳ, không kiểm `newUserId` tồn tại.
- Đề xuất: áp `validateChatPermission` cho từng participant; chỉ cho thêm vào GROUP; chỉ owner được thêm; dedupe và kiểm tồn tại.

### TUT3-13 (Medium) Ma trận quyền chat không khớp giữa danh sách và kiểm tra
- Danh sách (`getChatableUsers`) và `validateChatPermission` (`:413-464`) không khớp: STUDENT/PARENT thấy ADMIN nhưng `validateChatPermission` ném 403; TUTOR thấy TUTOR khác thì không có trong danh sách nhưng được validate.
- `checkTutorStudentAccess` (`:466-482`) với PARENT chỉ lấy con đầu tiên (`limit(1)`).
- Đề xuất: một hàm ma trận dùng chung cho cả danh sách và kiểm tra; xét tất cả con của phụ huynh.

### TUT3-14 (Medium) `IN ()` khi tutor có lớp chưa có học sinh
- `conversation.service.ts:589-605`: `classStudents.classId IN classIds` ổn định vì `classIds` đã kiểm length > 0, nhưng `users.parentId IN studentIdList` (`:605`) và `users.id IN studentIdList` (`:616`) dùng `studentIdList` có thể rỗng. Drizzle sinh `()` (`sql.js`, nhánh Array: `(` + các phần tử + `)`).
- Đề xuất: bỏ truy vấn khi mảng rỗng.

### TUT3-15 (Medium) Lỗi DB lộ ra client và không map sang 4xx
- `rpc-exception.filter.ts:49-57`: nhánh không phải `HttpException` trả `statusCode` 500 và `exception.message` (có câu SQL và tham số của drizzle). FK `23503`, unique `23505`, invalid uuid `22P02` không được map sang 4xx.
- Đề xuất: map `23503` → 404/400, `23505` → 409, `22P02` → 400; log chi tiết phía server, trả message chung.

### TUT3-16 (Medium) Thiếu kiểm tra quan hệ và FK
- (a) `session.service.ts:167-178`: `updateSessionService` không gọi `resolveSessionRefs` (`:26-48`). `session.repository.ts:221-247` set `lessonId`/`tutorId` thẳng, FK → 500 khi không tồn tại; lesson của giáo trình khác lớp vẫn được nhận.
- (b) `lesson.service.ts:33-51` và `lesson.service.ts:72-91` (`updateLessonService` chỉ bỏ `curriculumId`): `chapterId` không kiểm thuộc cùng giáo trình. Cây giáo trình bị sai.
- (c) `class.service.ts:107-147` và `class.repository.ts:62-82`: `curriculumId` không kiểm tồn tại (FK `classes.curriculumId` → 500).
- (d) `session.service.ts:42-45`: `tutorId` chỉ kiểm tồn tại. Có thể gán STUDENT làm tutor của buổi; `session.tutorId` không được dùng cho phân quyền nhưng dữ liệu bị sai.
- Đề xuất: dùng `resolveSessionRefs` cho update; kiểm `chapter.curriculumId === lesson.curriculumId`; kiểm `curriculumId` tồn tại; `tutorId` phải là TUTOR/ADMIN và là tutor của lớp.

### TUT3-17 (Medium) RMQ không ack thủ công, gateway retry lệnh ghi
- `main.ts:39-47` không cấu hình `noAck`. `node_modules/@nestjs/microservices/constants.js:23` đặt `RQM_DEFAULT_NOACK = true`, nên message được ack khi giao.
- Gateway (ngoài repo này) retry tối đa 2 lần khi timeout; các handler ghi không idempotent.
- Đề xuất: `noAck: false` với ack thủ công sau khi xử lý xong; idempotency key cho lệnh ghi; không retry lệnh ghi ở gateway.

### TUT3-18 (Medium) Danh sách lớp không ổn định và ADMIN thấy rỗng
- `class.repository.ts:161-166`: `select().from(classes).where().limit().offset()` không `orderBy`. Trang sau có thể trùng hoặc thiếu.
- `:141-143`: mọi role không phải STUDENT/PARENT (kể cả ADMIN) rơi vào `eq(classes.tutorId, userId)`.
- `report.repository.ts:124`: `orderBy(classes.createdAt)` không có khoá duy nhất, có thể lặp.
- Đề xuất: `orderBy(desc(createdAt), id)`; nhánh ADMIN không lọc theo tutor.

### TUT3-19 (Medium) Quyền đọc không nhất quán giữa các endpoint
- `session.repository.ts:79-151` (`getAll`): owner hoặc ghi danh, không có PARENT. `session.service.ts:137-143` (`getByClass`): owner-only. `schedule.service.ts:55-72` và `schedule.repository.ts:60-120`: `getAll` không có PARENT, `getByClass`/`getById` owner-only.
- `getSessionService`/`getClassWatch` cho PARENT, nên cùng một tài nguyên có quy tắc khác nhau.
- Đề xuất: một hàm `canAccessClass` (owner, ghi danh, phụ huynh của học sinh ghi danh) dùng chung cho session, schedule, tuition.

### TUT3-20 (Medium) Cập nhật lớp không transaction, xoá hết học sinh bằng mảng rỗng
- `class.service.ts:137-147`: `syncStudents` (xoá và thêm) chạy trước `repo.update`. Nếu `update` lỗi (curriculumId sai, unique), học sinh đã đổi nhưng thông tin lớp thì không.
- `class.repository.ts:86-100`: `studentIds: []` gọi `delete` mọi enrollment, không cảnh báo.
- Đề xuất: bọc transaction; tách thao tác xoá toàn bộ khỏi update thường.

### TUT3-21 (Medium) Mọi role đều tạo được giáo trình
- `curriculum.service.ts:38-52`: chỉ kiểm user tồn tại. Gateway `curriculum.controller.ts` không có `@Roles`. Chapter và lesson đã có `@Roles('ADMIN','TUTOR')` ở gateway, curriculum thì chưa.
- Đề xuất: kiểm role `TUTOR`/`ADMIN` ở service bằng `userService.getUserRoleById(userId)` (payload RPC không mang role), và thêm `@Roles('ADMIN','TUTOR')` ở gateway.

### TUT3-22 (Medium) `grade` của giáo trình không validate đúng
- `curriculum.schema.ts:18`: `union([string, number]).transform(Number)`. `'abc'` → NaN, `String(NaN)` = `'NaN'` (3 ký tự) không vừa `varchar(2)` (`schema.ts:232`). `100` cũng vượt.
- `curriculum.repository.ts:29`: ghi `gradesId: null`, bỏ giá trị client gửi (schema yêu cầu `gradesId` uuid).
- Đề xuất: `z.coerce.number().int().min(1).max(12)`; ghi `gradesId` sau khi kiểm tồn tại.

### TUT3-23 (Medium) Học phí không có state machine
- `tuition.service.ts:48-63`: chấp nhận PAID→UNPAID, sửa `amount` khi đã PAID. Dashboard tính doanh thu theo `paidDate` (xem `dashboard.repository.ts`).
- Không có chỗ nào chuyển UNPAID→OVERDUE (chỉ có enum và các truy vấn tổng).
- Đề xuất: bảng chuyển trạng thái hợp lệ; khoá `amount` khi PAID; job đánh dấu OVERDUE theo `dueDate`.

### TUT3-24 (Medium) Không kiểm thứ tự thời gian
- `session.schema.ts:23-42`, `schedule.schema.ts:27-34`, `class.schema.ts:6-33`: không có `.refine` so sánh `endAt > startAt` và `endTime > startTime`.
- Đề xuất: `.refine` ở create và update (update cần so sánh với giá trị hiện có).

### TUT3-25 (Medium) Báo cáo điểm danh không dùng bảng điểm danh
- `report.repository.ts:45-62` (`getSessionAttendance`) và `:130-186` (`getClassAggregates`): `attendanceRate` = COMPLETED/(COMPLETED+CANCELLED) theo session. Bảng `attendances` không tham gia.
- Ý đồ chưa xác nhận. Nếu muốn tỷ lệ thực tế, phải tính từ `attendances`.

### TUT3-26 (Medium) Bài tập không kiểm ghi danh, không chống trùng khi thiếu `sessionId`
- `exercise.service.ts:66-109`: `studentId` chỉ kiểm tồn tại (`:80-81`). Không có `sessionId` thì không kiểm ghi danh (`:86-105` chỉ chạy khi có session) và không chống trùng.
- Tutor (userId = tutor) gửi `studentId` của người ngoài lớp, rồi `gradeExerciseService` (`:172`) cho tutor tự chấm. Điểm đi vào `averageScore` ở báo cáo.
- Đề xuất: khi không có session, vẫn kiểm `studentId` ghi danh trong lớp của `tutorId`; chống trùng theo `(studentId, lessonId)` hoặc yêu cầu `sessionId`.

### TUT3-27 (Medium) Tài khoản bị khoá vẫn dùng được
- `jwt-auth.guard.ts:101-107` và `chat.gateway.ts:72-76` chỉ kiểm user tồn tại, không kiểm `users.isActive` (cột có ở `schema.ts:86`).
- `main.ts:26`: `enableCors({origin: true, credentials: true})`; `chat.gateway.ts:29-33`: CORS WS tương tự.
- Đề xuất: kiểm `isActive` ở guard và handshake WS; giới hạn origin bằng env.

### TUT3-28 (Medium) Route HTTP (cổng 8888) thiếu validation
- `chat.controller.ts:85-86`: `parseInt(limit)` không clamp, NaN hoặc âm đi vào SQL. `before` không kiểm UUID (`message.service.ts:29-34`) → 22P02 → 500.
- `chat.controller.ts:92, 105, 129`: `@Body()` không qua Zod. `curriculum.controller.ts:72, 145`: `@Body() CreateCurriculumDto` không có `ZodValidationPipe`.
- Chưa xác minh cổng 8888 có phơi ra ngoài. `docker-compose.yml` không khai báo service tutor.

### TUT3-29 (Medium) PII trong log RPC
- `trace-context.interceptor.ts:22-30`: `SENSITIVE_KEYS` chỉ có password, token. `:142` `requestBody = previewPayload(context)`; `:185-186` `responseBody = previewResponse(responseData)`. Cả hai gửi tới `log.create` (third-service `request_logs`).
- Response của `class.getStudents`, `class.getWatch`, `tuition.create` chứa email, phone; `ai.chat` chứa nội dung chat.
- Đề xuất: thêm email, phone, và các trường nội dung vào redact, hoặc không ghi response của các pattern nhạy cảm.

### TUT3-30 (Medium) `POST /run` không giới hạn tần suất
- `agents.controller.ts:10-16`: bỏ `@Public()` (đã sửa TUT2-06) nhưng không throttle. Mỗi request là một phiên SDK với `'1+1=?'`.
- Đề xuất: xoá endpoint demo, hoặc `@Roles('ADMIN')` và throttle.

### TUT3-31 (Medium) AI chat luôn trả câu mặc định và không có ngữ cảnh
- `agents.service.ts:41-47`: `'text' in message` không khớp kiểu SDK. Theo `sdk.d.ts:3602-3612`, `SDKAssistantMessage` có `message: BetaMessage` (văn bản ở `message.content[]`); theo `sdk.d.ts:5671-5703`, `SDKResultSuccess` có `result: string`. Kết quả luôn là `'Không có phản hồi từ trợ lý.'`.
- `:40`: `run(data.message)` không gửi lịch sử. `:17, 73-79`: lịch sử RAM, mất khi restart và không dùng chung giữa replica.
- Đề xuất: lấy `result` (kết quả cuối) hoặc `content[].text`; lưu lịch sử vào `ai_messages`, gửi N tin gần nhất cho model.

### TUT3-32 (Low) Trạng thái online không đúng khi nhiều tab
- `chat.gateway.ts:40, 82-84, 95-96`: `Map<userId, socketId>` một socket. Đóng tab cũ phát `offline` dù tab mới còn mở. `user:status` broadcast cho mọi client.
- Đề xuất: `Map<userId, Set<socketId>>`; chỉ phát cho người liên quan.

### TUT3-33 (Low) Dashboard PARENT/ADMIN trống, mốc ngày theo múi giờ server
- `dashboard.service.ts:56-68`: `tutorClassScope` cho mọi role không phải STUDENT. `dashboard.service.ts:36-46`: `setHours` theo giờ máy chủ.
- Đề xuất: nhánh riêng cho PARENT (qua con) và ADMIN; chuẩn hoá múi giờ.

### TUT3-34 (Low) Handler thử nghiệm còn trong production
- `app.controller.ts:28-41`: `@MessagePattern('tutor.test')` và `@MessagePattern('kafka.tutor')` (ném 400). Đề xuất: xoá.

### TUT3-35 (Low) Điểm danh lộ cho bạn học, chưa điểm danh hiện như vắng
- `attendance.service.ts:29-57`: học sinh và phụ huynh thấy roster và trạng thái điểm danh của cả lớp. `:52`: `present: record?.present ?? false` gán vắng cho người chưa điểm danh. `:65-79`: cho phép điểm danh buổi CANCELLED.
- Đề xuất: học sinh chỉ thấy bản ghi của mình; trả `null` cho chưa điểm danh; chặn buổi CANCELLED.

### TUT3-36 (Low) Trạng thái RESUBMIT không dùng được
- `exercise.service.ts:129-166`: không có đường nào đặt `RESUBMIT`. `report.repository.ts:75, 166`: `submissionRate` dùng `<> 'RESUBMIT'`.
- Đề xuất: endpoint tutor yêu cầu làm lại; cho submit khi RESUBMIT.

### TUT3-37 (Low) `getById` trả `null` với HTTP 200
- `chapter.service.ts:63-68`, `lesson.service.ts:65-70`, `curriculum.service.ts:76-87`. Các update/delete trả 404, `class.getById` trả 404 đúng.
- Đề xuất: ném `NotFoundException`.

### TUT3-38 (Low) Bản schema cục bộ lệch gateway
- `src/database/schema.ts` (527 dòng) được `database.module.ts:6` import khi runtime. Khác `gateway/src/database/schema.ts` ở bảng và cột test (`test_auth_profile`, `test_fixtures`, `expected_message`, `auth_profile`, `response_body`, `request_path`). CLAUDE.md nói không có bản local.
- Đề xuất: import từ `@tutor/gateway/schema` như đã mô tả trong `database.md`, xoá file local.

### TUT3-39 (Low) Chat WS không validate nội dung
- `chat.gateway.ts:101-132` và `message.service.ts:58-90`: `content` không kiểm rỗng và độ dài; không rate limit; `conversationId` không kiểm UUID.
- Đề xuất: Zod cho payload WS (content 1..N ký tự), rate limit theo user.

### TUT3-40 (Low) Đổi tên/mã lớp có thể 500
- `class.service.ts:145` (`repo.update`) không bắt `23505`, trong khi create (`:93-104`) có bắt. Tên lớp unique toàn hệ thống (kiểm ở `:126-128`), lộ sự tồn tại của lớp khác.
- Đề xuất: bắt `23505` ở update; unique theo `(tutorId, name)`.

### TUT3-41 (Low) `schedulesId` bị bỏ qua
- `class.schema.ts:25-32` (create) và `:45` (update) nhận `schedulesId`; `class.service.ts` và `class.repository.ts` không dùng.
- Đề xuất: xoá khỏi schema, hoặc implement.

### TUT3-42 (Low) Đánh dấu PAID lại ghi đè ngày thu
- `tuition.service.ts:60`: `dto.status === 'PAID' && dto.paidDate === undefined` → `paidDate: new Date()` cho cả bản đã PAID.
- Đề xuất: chỉ đặt `paidDate` khi chuyển từ trạng thái khác sang PAID.

### TUT3-43 (Low) Dead code trả toàn bộ row user kèm password
- `user.service.ts:28-38`: `getUserByField` `select()` cả row (cột `password` ở `schema.ts:83`). Không có caller trong `src/`.
- Đề xuất: xoá hàm.

### TUT3-44 (Low) Tài liệu API lệch schema
- `API_ENDPOINTS.md:190`: payload cũ của `POST /classes`. Schema thật: `code`, `subject` (bắt buộc), `startTime`, `endTime`, `tutorId`.
- Đề xuất: cập nhật tài liệu hoặc sinh từ Swagger.

### TUT3-45 (Low) Không có test cho các lỗi đã nêu
- `package.json:22`: `test:e2e` trỏ `test/jest-e2e.json` (không tồn tại). `.claude/rules/conventions.md` nhắc `test/packages/entities/update-schemas.spec.ts` (không tồn tại). Có các spec trong `test/features` và `test/database` nhưng không có test contract RPC và không có test cho TUT3-02 (build).
- Đề xuất: thêm test build trong CI; test contract payload RPC với gateway; sửa hoặc bỏ script `test:e2e`.

### TUT3-46 (Low) `tuition.update` không whitelist
- `tuition.repository.ts:123-137`: `...rest` spread nguyên payload. RPC `tuition.update` (`tuition.rpc.controller.ts:39-42`) không validate lại. Qua broker có thể đổi `classId`/`studentId`.
- Đề xuất: whitelist `amount`, `dueDate`, `paidDate`, `status`, `note`.

### TUT3-47 (Low) Chất lượng code
- `exercise.repository.ts:134-148`: trả khoá `data` thay vì `exercises`. `session.repository.ts:189`: `leftJoin(users, ...)` không dùng, `getDetailById` `:167-199`.
- Đề xuất: đổi khoá cho khớp quy ước; bỏ join thừa.

## Phụ lục A. Đối chiếu round2 và round1

Trạng thái theo mã TUT2 (round2). Cột "TUT3" là bug còn lại tương ứng.

| TUT2 (cũ TUT-) | Mức độ round2 | Trạng thái hiện tại | Ghi chú / TUT3 |
|---|---|---|---|
| 01 (TUT-01) | Critical | ĐÃ SỬA (curriculum update/delete, chapter, lesson owner qua curriculum; lesson update bỏ curriculumId) | Còn role giáo trình: TUT3-21 |
| 02 (TUT-02) | Critical | ĐÃ SỬA (role TUTOR/ADMIN; tutorId = userId; ADMIN gán tutor phải là TUTOR/ADMIN) | — |
| 03 (TUT-05) | High | ĐÃ SỬA (`toDate` ở `session.getAll`) | — |
| 04 (TUT-06) | High | ĐÃ SỬA MỘT PHẦN (join, typing kiểm participant) | `message:read` còn lỗ hổng: TUT3-10 |
| 05 (TUT-07) | High | ĐÃ SỬA MỘT PHẦN (sessionId bắt buộc tutor = class tutor; studentId ≠ tutorId) | Không kiểm ghi danh, không chống trùng khi thiếu session: TUT3-26 |
| 06 (TUT-08) | High | ĐÃ SỬA (không còn `@Public`) | Chưa throttle: TUT3-30 |
| 07 (TUT-09) | Medium | CÒN (reply lỗi; tool chưa khoá) | TUT3-03, TUT3-31 |
| 08 (TUT-10) | Medium | CÒN | TUT3-05 |
| 09 (TUT-11) | Medium | ĐÃ SỬA MỘT PHẦN (PAID tự gán paidDate) | Chưa có state machine, OVERDUE: TUT3-23 |
| 10 (TUT-13) | Medium | CÒN | TUT3-16 |
| 11 (TUT-14) | Medium | ĐÃ SỬA MỘT PHẦN (regex giờ) | Thiếu so sánh thời gian: TUT3-24 |
| 12 (TUT-15) | Medium | CÒN | TUT3-17 |
| 13 (TUT-16) | Medium | CÒN | TUT3-18 |
| 14 (TUT-17) | Medium | CÒN | TUT3-19 |
| 15 (TUT-18) | Medium | CÒN | TUT3-20 |
| 16 (TUT-19) | Medium | CÒN | TUT3-11, TUT3-12 |
| 17 (TUT-20) | Medium | CÒN | TUT3-15 |
| 18 (TUT-21) | Medium | ĐÃ SỬA (`resolveJwtAccessSecret` throw khi thiếu) | — |
| 19 (TUT-23) | Medium | CÒN | TUT3-07 |
| 20 (TUT-03, 04, 12, 22) | Low | ĐÃ SỬA (update schema có `.extend` không default, `nullable` cho date) | TUT-22 (1970) cũng đã sửa |
| 21 (TUT-24) | Low | CÒN | TUT3-22 |
| 22 (TUT-25) | Low | CÒN | TUT3-37 |
| 23 (TUT-26) | Low | CÒN | TUT3-28 |
| 24 (TUT-27) | Low | CÒN | TUT3-32 |
| 25 (TUT-28) | Low | CÒN | TUT3-35 |
| 26 (TUT-29) | Low | CÒN | TUT3-33 |
| 27 (TUT-30) | Low | CÒN | TUT3-34 |
| 28 (TUT-31) | Low | CÒN | TUT3-08 |
| 29 (TUT-32) | Low | CÒN | TUT3-36 |
| 30 (TUT-33) | Low | CÒN | TUT3-44 |
| 31 | High | ĐÃ SỬA (`toDate` ở create/update/filter, schema date nullable) | — |
| 32 | High | ĐÃ SỬA (handler tuition nhận payload object khớp gateway) | — |
| 33 | High | ĐÃ SỬA (scope `canRead`, summary theo tutor) | — |
| 34 | High | ĐÃ SỬA (kiểm truy cập `loadAccessibleClass`) | PII: TUT3-04; materials: TUT3-09 |
| 35 | Medium | CÒN | TUT3-14 |
| 36 | Medium | CÒN | TUT3-13 |
| 37 | Medium | CÒN | TUT3-11 |
| 38 | Medium | CÒN | TUT3-31 |
| 39 | Medium | CÒN | TUT3-06 |
| 40 | Medium | ĐÃ SỬA MỘT PHẦN (owner curriculum) | FK chapter cùng giáo trình: TUT3-16 |
| 41 | Medium | ĐÃ SỬA MỘT PHẦN (chapter/lesson/curriculum có orderBy) | class list còn: TUT3-18 |
| 42 | Medium | ĐÃ SỬA MỘT PHẦN (có thư mục test) | script e2e hỏng: TUT3-45 |
| 43 | Low | ĐÃ SỬA (`senderId != userId`) | — |
| 44 | Low | CÒN | TUT3-38 |
| 45 | Low | CÒN | TUT3-27 |
| 46 | Low | CÒN (tên lớp unique toàn hệ thống) | TUT3-40 |
| 47 | Low | CÒN | TUT3-22 |
| 48 | Low | CÒN | TUT3-39 |
| 49 | Medium | CÒN | TUT3-04 |
| 50 | Low | CÒN | TUT3-46 |

Tổng: ĐÃ SỬA hoàn toàn 11 (TUT2-01, 02, 03, 06, 18, 20, 31, 32, 33, 34, 43); ĐÃ SỬA MỘT PHẦN 7 (TUT2-04, 05, 09, 11, 40, 41, 42); CÒN TỒN TẠI 32 (phần còn lại). TUT2-34 tính là ĐÃ SỬA vì các kiểm tra truy cập đã có, phần PII còn lại nằm ở TUT3-04 và TUT3-09.

## Phụ lục B. Những điều chưa xác minh
- Cổng 8888 có phơi ra ngoài hay không (TUT3-28). `docker-compose.yml` không khai báo service tutor.
- Mức triển khai thực tế của RabbitMQ (TUT3-01). Mức khai thác phụ thuộc broker có truy cập được từ ngoài hay không.
- Tool và permission mặc định của Claude Agent SDK khi chạy headless (TUT3-03).
- Gateway retry và các @Roles phía gateway: đọc từ báo cáo cũ và code gateway hiện tại, chỉ kiểm phần liên quan.
- Chưa chạy DB thật, chưa chạy `bun test`/`jest`, chưa chạy RabbitMQ.
