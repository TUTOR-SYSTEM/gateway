# Review: tutor

## Tổng quan

**Phạm vi.** Service `D:\projects\tutor` (NestJS 11 + Drizzle + RabbitMQ RPC, chạy trên Bun). Đã đọc `src/` (main, app.module, rabbitmq, guards, filters, interceptors, helpers, entities/zod schema, và toàn bộ 15 feature: class, schedule, session, curriculum, chapter, lesson, tuition, exercise, attendance, dashboard, report, agents, chat, user, app.controller), `scripts/recreate-db.ts` (các script seed chỉ lướt qua), cùng `CLAUDE.md`, `AGENTS.md`, `API_ENDPOINTS.md`. Đối chiếu thêm với gateway (`D:\projects\gateway\src\features\*`, `rabbitmq/rmq.producer.ts`) để kiểm tra payload RPC, validate và retry.

Lưu ý: `tutor-management-request.sequence.json` không tồn tại trong `D:\projects\architech` (thư mục chỉ có auth-flows, UI.architecture...). Không có luồng "tutor request/approval" trong code. Service này thực chất là quản lý lớp, lịch, buổi học, học phí, bài tập, điểm danh, giáo trình và chat. Vì vậy phần review tập trung vào các luồng thực tế đó.

**Đánh giá chung.** Phần class/session/schedule/tuition/exercise có kiểm tra quyền sở hữu khá cẩn thận (trả 404 thay vì 403 để không lộ tồn tại). Tuy vậy còn các lỗ hổng lớn:
1. Curriculum, chapter và lesson hoàn toàn không có kiểm tra quyền sở hữu (chapter và lesson thậm chí không nhận `userId` qua RPC).
2. `POST /classes` không kiểm tra role và `tutorId` có thể là người khác, nên một STUDENT cũng thành "tutor" của lớp.
3. Mẫu Zod `.default().optional()` kết hợp `.partial()` (Zod 4.4.3, đã chạy thử xác nhận) làm các API PUT ghi đè dữ liệu bằng giá trị mặc định (tuition status, class tuition/status/format, schedule format, chapter/lesson order).
4. Chat WebSocket không kiểm tra thành viên phòng.
5. Gateway retry các RPC không idempotent trong khi service dùng auto-ack.

Các RPC handler không có guard xác thực. Tôi đánh giá guard `APP_GUARD` không áp dụng cho microservice của hybrid app (cần xác minh, xem mục cuối). Vì vậy toàn bộ quyền truy cập phụ thuộc vào gateway và `userId` trong payload.

## Thống kê

| Severity | Số lượng |
|---|---|
| Critical | 2 |
| High | 6 |
| Medium | 15 |
| Low | 10 |
| **Tổng** | **33** |

## Danh sách bug

| ID | Severity | File:line | Mô tả | Kịch bản lỗi | Đề xuất sửa |
|---|---|---|---|---|---|
| TUT-01 | Critical | `features/curriculum/curriculum.service.ts:89-127`; `features/chapter/chapter.service.ts:20,48,57`; `features/lesson/lesson.service.ts:20,56,65`; `features/chapter/chapter.rpc.controller.ts`, `features/lesson/lesson.rpc.controller.ts` | Update/delete curriculum chỉ kiểm tra "tồn tại", không kiểm tra `curriculums.userId === userId`. Chapter và lesson (create/update/delete/get) không có `userId` trong payload nên không thể kiểm tra quyền. Gateway cũng không gắn `@Roles`. | Bất kỳ user đăng nhập (kể cả STUDENT) gọi `DELETE /curriculum/:id` xoá giáo trình của tutor khác. `ON DELETE CASCADE` xoá luôn chapter/lesson. `classes.curriculumId` bị set null, `sessions.lessonId` bị set null. Hoặc `PUT /lesson/:id` đổi `curriculumId` để chuyển/sửa tài liệu. | Truyền `userId` vào mọi RPC chapter/lesson. Kiểm tra owner (join lesson/chapter → curriculum.userId) trước khi ghi. Giới hạn role TUTOR/ADMIN. Không cho đổi `curriculumId` trong update lesson. |
| TUT-02 | Critical | `features/class/class.service.ts:61-84`; `class.repository.ts:41-57`; `class.schema.ts:26` | Tạo lớp không kiểm tra role của người gọi. `tutorId` lấy từ body, chỉ kiểm tra user tồn tại (không kiểm tra role TUTOR). Không ép `tutorId === userId`. | (a) STUDENT/PARENT gọi `POST /classes` với `tutorId=<chính mình>`. Họ trở thành owner (`getOwnedClassService`, `tutorId !== userId`) nên được dùng `POST /classes/:id/students` (enroll bất kỳ STUDENT, `assertAllStudents` chỉ kiểm tra role). Sau đó `GET /classes/:id/students` trả email/phone/parent của học sinh (`class.repository.ts:getAllStudent`), và tạo tuition, session, schedule. (b) Tạo lớp gán cho tutor nạn nhân (spam vào danh sách của họ). | Chỉ cho role TUTOR/ADMIN tạo lớp. Gán `tutorId = userId` (hoặc chỉ ADMIN mới được chỉ định tutor). Kiểm tra role của tutor được chỉ định = TUTOR. |
| TUT-03 | High | `packages/entities/tuition/tuition.schema.ts:11,15`; `features/tuition/tuition.repository.ts:123-139` | `updateTuitionSchema = create.partial()` mà `status` là `.default('UNPAID').optional()`. Zod 4 vẫn áp default khi field vắng mặt (đã chạy thử: `partial().parse({})` → `{status:'A', order:0}`). Repo `set({...rest})` ghi `status='UNPAID'`. Gateway dùng cùng schema. | Tutor `PUT /tuitions/:id {note:"..."}` hoặc đổi `amount` trên bản ghi đã `PAID`. Status bị reset về `UNPAID`, `paidDate` còn nhưng doanh thu/dashboard (lọc `status='PAID'`) mất bản ghi. | Định nghĩa `updateTuitionSchema` tường minh, không dùng `.partial()` trên field có default (như `updateSessionSchema`). |
| TUT-04 | High | `packages/entities/class/class.schema.ts:16-19,35-40`; `class.repository.ts:60-77` | Cùng lỗi default-trong-partial với class: mỗi lần `PUT /classes/:id` không gửi `tuition`/`status`/`format` thì `tuition` bị ghi `0`, `status='OPEN'`, `format='OFFLINE'`. | Đổi tên/mô tả lớp mà lớp đang `CLOSED`, học phí 2.000.000 và `ONLINE` → sau update thành `OPEN`, `0`, `OFFLINE`. | Như TUT-03: schema update tường minh, không default. |
| TUT-05 | High | `features/session/session.repository.ts:107-108` (+ `session.rpc.controller.ts` `session.getAll`) | `startDate`/`endDate` đi qua RPC (JSON) thành chuỗi ISO. Repo truyền thẳng chuỗi vào `gte(sessions.startAt, startDate)`. Cột `timestamp(mode:'date')` gọi `value.toISOString()` → `TypeError: toISOString is not a function`. Các nơi ghi đã dùng `toDate()` (xem `helpers/date.helper.ts`) nhưng nơi lọc thì không. | `GET /sessions?startDate=2026-10-01&endDate=2026-10-31` (lịch tháng) → RPC trả 500. | Bọc `toDate(startDate)`/`toDate(endDate)` trong `getAll`, hoặc `z.coerce.date()` lại trong RPC. |
| TUT-06 | High | `features/chat/chat.gateway.ts:137-205`; `chat/message.service.ts:92-124` | `conversation:join`, `typing:start/stop`, `message:read` không kiểm tra user có là participant. `updateMessageStatus(messageId)` không giới hạn conversation/người gửi. `markConversationAsRead` cập nhật `messages.status='READ'` cho cả conversation mà không kiểm tra participant. | User bất kỳ emit `conversation:join {conversationId}` rồi nhận mọi `message:receive` của hội thoại đó (đọc tin nhắn riêng/nhóm). Có thể đánh dấu READ tin của người khác. | Kiểm tra participant ở join, typing, read. Validate UUID. Ràng buộc `updateMessageStatus` theo `conversationId` và `senderId != userId`. |
| TUT-07 | High | `features/exercise/exercise.service.ts:66-100,142-162` | Create chỉ yêu cầu `studentId===userId` HOẶC `tutorId===userId`. `tutorId` không được kiểm tra là tutor của lớp/session, `studentId` không được kiểm tra có ghi danh. Session truy cập kiểm tra theo `userId` người gọi, không theo học sinh. | (a) STUDENT tạo bài với `studentId=tutorId=chính mình` rồi gọi `exercise.grade` (`found.tutorId===userId`) tự chấm điểm, ảnh hưởng `averageScore` report. (b) Người dùng bất kỳ đặt `tutorId=mình`, `studentId=nạn nhân` để chèn bài nộp thay học sinh; `findByStudentSession` rồi chặn học sinh thật nộp (`EXERCISE_ALREADY_SUBMITTED`). | Suy ra `tutorId` từ `session.class.tutorId`. Yêu cầu `studentId` được ghi danh vào lớp của session. Cấm `studentId===tutorId`. Role-based: chỉ STUDENT tạo bài nộp. |
| TUT-08 | High | `features/agents/agents.controller.ts:10-14`; `app.module.ts` | `@Public() @Post('run')` chạy `query()` của Claude Agent SDK cho mọi request ẩn danh trên HTTP port 8888 (không throttle). | Gọi `POST /run` lặp lại → tiêu tốn chi phí/tài nguyên LLM không giới hạn (DoS ví). | Xoá endpoint demo hoặc bỏ `@Public()`/thêm role ADMIN, hoặc chỉ bật ở dev. |
| TUT-09 | Medium | `features/agents/agents.service.ts:24-52` | `chat()` ghép câu trả lời bằng `'text' in message && message.text`. `SDKAssistantMessage` không có field `text` (nội dung nằm ở `message.content[]`), `SDKResultSuccess` dùng `result`. Kết quả luôn là `'Không có phản hồi từ trợ lý.'`. Ngoài ra `query()` chạy full agent với mặc định (tools, cwd của service) cho input người dùng, không có `allowedTools`/`maxTurns`/timeout. | `ai.chat` gần như luôn trả chuỗi mặc định. Prompt injection có thể khiến agent dùng tool (tuỳ permissionMode mặc định, cần xác minh). | Lấy text từ `message.type==='assistant'` (`content[].text`) hoặc `result`. Khoá tools (`allowedTools: []`, `maxTurns`), đặt timeout. |
| TUT-10 | Medium | `features/tuition/tuition.service.ts:16-25`; `tuition.repository.ts:70-84` | Tạo tuition không kiểm tra `studentId` tồn tại/ghi danh trong lớp. Với `studentId` bất kỳ, FK lỗi thành 500, còn user có thật thì được tạo. `create()` trả về `findById` kèm `firstName, lastName, phone, avatar` của user đó. | Tutor tạo tuition cho UUID user bất kỳ → rò rỉ tên/SĐT/avatar. Tạo công nợ cho học sinh không thuộc lớp. | Kiểm tra `repo.isEnrolled(classId, studentId)` trước khi insert; trả 400/404 rõ ràng. |
| TUT-11 | Medium | `features/tuition/tuition.service.ts:48-60`; `tuition.repository.ts:123-139`; `dashboard.repository.ts:getRevenue, getMonthlyRevenue` | Chuyển `status='PAID'` không tự set `paidDate`; không có job chuyển `UNPAID→OVERDUE`. Dashboard tính doanh thu theo `paidDate` (`gte/lte paidDate`, `extract(month from paidDate)`). | Tutor đánh dấu PAID mà không gửi `paidDate` → doanh thu tháng/biểu đồ bằng 0 dù status PAID. Học phí quá hạn không bao giờ thành OVERDUE. | Khi status→PAID mà `paidDate` null thì gán `now()`. Tính OVERDUE theo `dueDate` khi truy vấn hoặc bằng cron. |
| TUT-12 | Medium | `packages/entities/schedule/schedule.schema.ts:29,56`; `curriculum/curriculum.schema.ts:36,47,62` (chapter/lesson `order`) | Cùng lỗi default-trong-partial: update schedule không gửi `format` → bị ghi `ONLINE`. Update chapter/lesson không gửi `order` → bị ghi `0`. | Sửa `location` của lịch học OFFLINE → thành ONLINE. Đổi tiêu đề chapter → mất thứ tự sắp xếp (`order=0`). | Schema update tường minh, không default. |
| TUT-13 | Medium | `features/session/session.service.ts:167-179`; `session.repository.ts:update` | `updateSessionService` không gọi `resolveSessionRefs`: `lessonId`/`tutorId` mới không được kiểm tra tồn tại → FK lỗi thành 500, `lessonId` thuộc curriculum khác lớp vẫn được nhận. `tutorId: null` tường minh ghi null. Không kiểm tra trạng thái chuyển (COMPLETED→SCHEDULED tuỳ ý). | PUT session với lessonId của giáo trình người khác; hoặc lùi trạng thái buổi đã COMPLETED, làm sai `exercise gating` và report. | Dùng `resolveSessionRefs` cho update; kiểm tra lesson thuộc `class.curriculumId`; thêm state machine hợp lệ cho `status`. |
| TUT-14 | Medium | `packages/entities/session/session.schema.ts:29-34,76-77`; `schedule.schema.ts:27-28,39-40`; `class.schema.ts:21-22` | Không validate `endAt > startAt` (session, class), regex giờ `^\d{2}:\d{2}$` chấp nhận `99:99` và `endTime<=startTime`; không chống trùng `sessionNumber` trong lớp, trùng/chồng lịch; bulk schedule giới hạn 7 nhưng không tính lịch đã có. | Tạo session kết thúc trước khi bắt đầu; schedule `25:61`; nhiều session cùng `sessionNumber`; 2 lịch trùng giờ. | Thêm `.refine` so sánh thời gian, regex `([01]\d\|2[0-3]):[0-5]\d`, unique index `(class_id, session_number)` + kiểm tra chồng lấn. |
| TUT-15 | Medium | `features/rabbitmq/rmq.producer.ts` (gateway `:113-127`), `main.ts:38-46` | Gateway `send()` retry tối đa 3 lần khi timeout, kể cả thao tác không idempotent. Nest RMQ mặc định `noAck:true` nên tutor vẫn xử lý bản đầu (đã ack khi nhận). `prefetchCount:10` không có tác dụng khi `noAck:true`. | Query chậm > 10s → gateway gửi lại `tuition.create`, `session.create`, `schedule.create`, `exercise.create`... → bản ghi trùng (class thì đã có unique). Nếu service crash giữa chừng, message mất. | Không retry cho lệnh ghi (hoặc dùng idempotency key). Cấu hình `noAck:false` với ack thủ công. |
| TUT-16 | Medium | `features/class/class.repository.ts:161-166`, `:140-143` | `getClasses` không có `orderBy` nên phân trang `limit/offset` không ổn định (trùng/thiếu bản ghi giữa các trang). Role ADMIN (và mọi role khác STUDENT/PARENT) rơi vào `eq(classes.tutorId, userId)` nên ADMIN thấy danh sách rỗng. | Trang 2 lặp lại lớp của trang 1. Admin vào `/classes` không thấy gì. | Thêm `.orderBy(desc(createdAt), id)`. Nhánh ADMIN không lọc theo `tutorId`. |
| TUT-17 | Medium | `session.repository.ts:getAll accessWhere (~l.102)`, `schedule.repository.ts:~l.82`, `session.service.ts:137`, `schedule.service.ts:getSchedulesByClassService`, `tuition.repository.ts:canRead` | Quyền không nhất quán: `getSessionService`/class watch cho PARENT; nhưng `session.getAll`, `schedule.getAll` chỉ cho owner/enrolled. `session.getByClass`, `schedule.getByClass`, `schedule.getById` chỉ cho owner (student không xem được). Tuition chỉ student/tutor, PARENT không xem học phí con. | Phụ huynh vào lịch/buổi học/học phí của con → danh sách rỗng; học sinh gọi `getByClass` → 404. | Thống nhất một hàm `canAccessClass` (owner / enrolled / parent) dùng chung. |
| TUT-18 | Medium | `features/class/class.service.ts:121-132` | `updateClassService` chạy `syncStudents` (delete + insert) trước rồi mới `repo.update`, không trong transaction. `repo.update` lỗi (unique name/code race, FK `curriculumId`) → học sinh đã bị đổi nhưng thông tin lớp thì không; không bắt `23505` như ở create. `curriculumId` mới không được kiểm tra tồn tại/quyền. | Hai request đổi tên song song → một bên 500, danh sách học sinh đã đổi dở. | Gói trong `db.transaction`, bắt unique violation, kiểm tra curriculum. |
| TUT-19 | Medium | `features/chat/conversation.service.ts:174,193,236` | `createGroupConversation` bỏ qua `validateChatPermission` và không validate participant (FK/trùng → 500). `addParticipant` cho mọi thành viên thêm bất kỳ user nào (kể cả DIRECT/CLASS, không kiểm tra tồn tại/quyền). `createClassConversation` không kiểm tra người gọi thuộc lớp. Hội thoại CLASS chỉ chụp danh sách học sinh lúc tạo, không đồng bộ khi thêm/xoá học sinh. | Lách luật "student chỉ chat với bạn cùng lớp/tutor" bằng tạo group. Học sinh mới vào lớp không thấy chat lớp; học sinh bị xoá khỏi lớp vẫn đọc được. | Áp `validateChatPermission` cho group/add; đồng bộ participants khi `addStudents/syncStudents`. |
| TUT-20 | Medium | `packages/filters/rpc-exception.filter.ts:49`; `packages/interceptor/trace-context.interceptor.ts` | Lỗi không phải `HttpException` (Postgres: FK, invalid uuid, unique) trả `500` với `exception.message` nguyên bản (có thể chứa SQL/tên constraint). Nhiều chỗ thiếu validate nên dễ gặp (xem TUT-10, 13, 18). | Client nhận chi tiết SQL; FK sai báo 500 thay vì 400/404. | Map mã Postgres (23503→400/404, 23505→409, 22P02→400); ẩn message nội bộ. |
| TUT-21 | Medium | `packages/guards/jwt-auth.guard.ts:87-89`; `packages/configs/jwt-sign.config.ts:20`; `features/chat/chat.gateway.ts:63` | Nếu thiếu `JWT_ACCESS_SECRET` và `JWT_SECRET`, service lặng lẽ dùng secret cứng `'dev-insecure-jwt-secret'` thay vì fail-fast. | Triển khai thiếu env → kẻ tấn công tự ký token ADMIN hợp lệ. | Throw khi khởi động nếu thiếu secret (production). |
| TUT-22 | Medium | `packages/entities/tuition/tuition.schema.ts:9-10`; `session.schema.ts:35,38,41` | `z.coerce.date().optional()` với `null` cho ra `1970-01-01` (đã chạy thử). Muốn xoá `dueDate`/`paidDate` bằng `null` sẽ lưu epoch. | PUT tuition `{paidDate:null}` → paidDate = 1970 → báo cáo doanh thu năm 1970. | Dùng `z.coerce.date().nullable().optional()` hoặc preprocess null→null. |
| TUT-23 | Medium | `features/class/class.service.ts:237-250`; `schema.ts` (cascade) | `delClass` xoá cứng lớp, cascade xoá sessions, schedules, class_students, tuitions, attendances, exercises(session set null). Không kiểm tra lớp còn học phí chưa thu / đang OPEN. | Tutor xoá nhầm lớp → mất toàn bộ lịch sử học phí đã thu và điểm danh. | Soft delete (`status=CLOSED`) hoặc chặn xoá khi còn dữ liệu tài chính. |
| TUT-24 | Low | `features/curriculum/curriculum.repository.ts:19-33,162-173`; `schema.ts curriculums.code` | `create` luôn ghi `gradesId: null` dù schema bắt buộc `gradesId`. `code` không unique (không constraint, không kiểm tra) dù có `generateCode`. `update` không set `updatedAt`, `data` truyền thẳng vào `set`. | Mất grade được chọn; trùng mã giáo trình. | Lưu `gradesId`, thêm unique code, set `updatedAt`. |
| TUT-25 | Low | `chapter.service.ts:41`, `lesson.service.ts:49`, `curriculum.service.ts:76` | `getById` trả `null` (HTTP 200 body null) khi không tồn tại thay vì 404, lệch với `update/delete` (404). | Client không phân biệt "không có". | Ném `NotFoundException`. (Riêng `getLessonByIdService` đang được session/exercise dùng với `if(!lesson)`, cần chỉnh cùng lúc.) |
| TUT-26 | Low | `features/chat/chat.controller.ts:85,105-120` | Không validate tham số: `limit` NaN/âm/rất lớn, `before`/`:id` không phải UUID → lỗi DB 500; body không qua Zod; group `name` không giới hạn. | `GET /chat/conversations/abc/messages?limit=-1` → 500. | Zod pipe + clamp `limit`. |
| TUT-27 | Low | `features/chat/chat.gateway.ts:84,95-99` | `onlineUsers: Map<userId, socketId>` chỉ giữ 1 socket. Mở tab thứ 2 ghi đè; đóng tab cũ gọi `delete` và phát `offline` dù tab mới còn mở. `user:status` broadcast tới mọi client. | Trạng thái online chập chờn; `sendToUser` chỉ tới 1 tab. | Dùng `Map<userId, Set<socketId>>` và room theo user. |
| TUT-28 | Low | `features/attendance/attendance.service.ts:30-47,58-79` | Học sinh/phụ huynh xem được điểm danh và tên của cả lớp. Không phân biệt "chưa điểm danh" với "vắng" (`present=false` mặc định). Cho điểm danh ở session CANCELLED/chưa diễn ra. | Lộ dữ liệu bạn học; báo cáo vắng sai. | Student chỉ thấy bản ghi của mình; trả `null` cho chưa điểm danh; kiểm tra trạng thái session. |
| TUT-29 | Low | `features/dashboard/dashboard.service.ts:61-68`; `dashboard.repository.ts` | PARENT/ADMIN bị coi là tutor (`tutorClassScope(userId)`) nên toàn số 0. Mốc tuần/ngày/tháng dùng giờ máy chủ (`setHours`), không theo múi giờ người dùng. | Dashboard phụ huynh trống; lệch ngày khi server UTC. | Nhánh riêng cho PARENT/ADMIN; chuẩn hoá múi giờ. |
| TUT-30 | Low | `src/app.controller.ts:28-41`; `main.ts:45` | Handler thử nghiệm `tutor.test` và `kafka.tutor` (luôn ném 400) còn trong production. | Ai gửi được vào queue có thể gọi. Rác log. | Xoá. |
| TUT-31 | Low | `scripts/recreate-db.ts:35-60` | Script DROP mọi bảng/enum của schema `public` (DB dùng chung với user service) không có guard môi trường, và gọi `drizzle.config.ts` đã không còn trong repo (file không tồn tại). | Chạy nhầm trên DB dùng chung → mất dữ liệu cả hệ thống; script lỗi vì thiếu config. | Thêm guard `NODE_ENV!=='production'` + xác nhận; trỏ config sang gateway. |
| TUT-32 | Low | `exercise.service.ts:111-134`; `exercise.schema.ts` (`RESUBMIT`) | Enum có `RESUBMIT` nhưng không đường nào đặt trạng thái này (grade luôn `GRADED`; submit lại bị chặn khi `GRADED`). Bài đã chấm không bao giờ nộp lại được; `submissionRate` ở report tính `status <> 'RESUBMIT'`. | Tutor muốn yêu cầu làm lại bài thì không thể. | Thêm endpoint/field cho tutor đặt `RESUBMIT`; cho phép submit lại khi `RESUBMIT`. |
| TUT-33 | Low | `API_ENDPOINTS.md:190` vs `class.schema.ts` | Tài liệu mô tả payload `{name, subject?, maxStudents?, startDate?, endDate?}`, thực tế schema dùng `code, subject (bắt buộc), startTime, endTime, tutorId` (bắt buộc). Mục "Known bugs" nói `GET /curriculum` dùng wallet schema, hiện đã dùng `getCurriculumsQuerySchema` (tài liệu cũ). Roles ghi "All" cho POST /classes (trùng với TUT-02). | Client đọc tài liệu gửi sai payload. | Cập nhật tài liệu. |

## Chi tiết

### TUT-01 (Critical) — Curriculum/Chapter/Lesson không có kiểm tra quyền sở hữu

`curriculum.service.ts` (update/delete):
```ts
const existing = await this.curriculumRepository.findById(id);
if (!existing) throw new NotFoundException(ERROR_MESSAGES.CURRICULUM_NOT_FOUND);
return await this.curriculumRepository.update(id, data);   // không so sánh existing.userId với userId
```
`chapter.rpc.controller.ts` / `lesson.rpc.controller.ts` nhận payload `{ id, data }`, `{ curriculumId, data }`... Gateway cũng gọi `rmqProducer.send('chapter.update', { id, data })` mà không gửi `userId` (`gateway/src/features/chapter/chapter.controller.ts:80`). Vì vậy tầng service không có thông tin người gọi để kiểm tra. Hậu quả:
- DELETE curriculum của người khác (cascade chapter/lesson; lớp bị set null curriculum).
- Thêm/sửa/xoá chapter, lesson trong giáo trình của người khác, kể cả đổi `curriculumId` của lesson qua `updateLessonSchema = createLessonSchema.partial()` (field `curriculumId`/`chapterId` được `set(data)` trực tiếp trong `lesson.repository.ts:update`).
- `getAll`/`getById` trả toàn bộ giáo trình mọi người (có thể là chủ ý "thư viện chung", cần xác nhận).

### TUT-02 (Critical) — Leo thang đặc quyền qua `POST /classes`

```ts
// class.service.ts:61-84
if (!(await this.user.userExists(userId))) ...            // chỉ kiểm tra tồn tại
...
this.user.userExists(tutorId)                              // tutorId do client gửi, không kiểm tra role TUTOR
return await this.repo.create({ data });                   // tutorId: data.tutorId
```
Mọi kiểm tra sở hữu về sau là `classData.tutorId === userId`. Người gọi chỉ cần đặt `tutorId` bằng id của chính mình. Từ đó họ dùng được `addStudentsService` (chỉ kiểm tra role STUDENT của đích), `getAllStudentsService` (lộ email/phone/parent/relationship), `tuition.create` và các API owner khác. Gateway không có `@Roles` cho class (`API_ENDPOINTS.md` ghi "All").

### TUT-03 / TUT-04 / TUT-12 — Default của Zod 4 bị áp lại trong `.partial()`

Đã chạy thử với `zod@4.4.3` của repo:
```js
z.object({status:z.enum(['A','B']).default('A').optional(), order:z.coerce.number().int().default(0).optional(), n:z.string()}).partial().parse({})
// => { status: 'A', order: 0 }
```
`updateSessionSchema` đã được viết tường minh vì chính lý do này (xem comment trong `session.schema.ts`), nhưng class, tuition, schedule, chapter, lesson thì chưa. Repo dùng kiểu `...(data.x !== undefined && {...})` (class) hoặc `set({...rest})` (tuition) nên giá trị mặc định đó bị ghi xuống DB. Thiệt hại đáng kể nhất là tuition (`status`, tiền) và class (`tuition`, `status`).

### TUT-05 (High) — `session.getAll` với `startDate/endDate` qua RPC

`session.repository.ts:107-108`:
```ts
...(startDate ? [gte(sessions.startAt, startDate)] : []),
...(endDate ? [lte(sessions.startAt, endDate)] : []),
```
Gateway parse query bằng Zod thành `Date`, nhưng serialize JSON qua RabbitMQ thành chuỗi ISO. `toDate()` trong `helpers/date.helper.ts` được tạo ra đúng cho vấn đề này (ghi chú: "Drizzle's timestamp columns call toISOString()") nhưng chỉ áp dụng cho các lệnh ghi. Lọc theo ngày sẽ ném TypeError → 500. Lưu ý: gateway swagger của `GET /sessions` không liệt kê `startDate/endDate` nên có thể chưa được gọi trong thực tế, nhưng schema cho phép.

### TUT-06 (High) — Chat WebSocket không kiểm tra thành viên

```ts
@SubscribeMessage('conversation:join')
handleJoinConversation(@ConnectedSocket() client, @MessageBody() data: { conversationId: string }) {
  void client.join(data.conversationId);   // không kiểm tra conversationParticipants
```
`createMessage` có kiểm tra participant, nhưng broadcast `this.server.to(conversationId)` gửi cho mọi socket đã join. Một user hợp lệ chỉ cần biết/đoán conversationId (UUID, nhưng lộ qua danh sách lớp, log...) để nghe lén. `message:read` gọi `updateMessageStatus(data.messageId, 'READ')` không ràng buộc.

### TUT-07 (High) — Giả mạo bài nộp / tự chấm điểm

```ts
if (data.studentId !== userId && data.tutorId !== userId) throw Forbidden;  // OR, không ràng buộc quan hệ
...
// gradeExerciseService
if (found.tutorId !== userId) throw Forbidden;     // tutorId do người tạo bài tự chọn
```
Student tạo bài với `tutorId = studentId = userId` rồi tự `grade` với điểm 10; điểm này vào `averageScore` ở report (`report.repository.ts`).

### TUT-08 (High) — `POST /run` công khai

```ts
@Public()
@Post('run')
run() { return this.agentsService.run('1+1=?'); }
```
Mỗi request tạo một phiên Claude Agent SDK. Không throttle, không xác thực.

## Vấn đề tích hợp

1. **Gateway không truyền `userId` cho chapter/lesson** (`gateway/src/features/chapter/chapter.controller.ts:44-89`, `lesson.controller.ts:46-91`), nên tutor-service không thể kiểm tra quyền (TUT-01). Cần sửa cả hai phía.
2. **Retry của gateway** (`gateway/.../rmq.producer.ts:113-127`, mặc định 2 retry) cộng với `noAck:true` ở tutor tạo bản ghi trùng cho các lệnh ghi (TUT-15).
3. **Serialization Date qua JSON**: gateway validate rồi gửi DTO; ngày thành chuỗi ISO. Tutor đã dùng `toDate()` ở các lệnh ghi nhưng thiếu ở filter session (TUT-05). Tutor không validate lại payload RPC (không có `ZodValidationPipe` cho `@Payload`), mọi mặc định (`page`, `limit`) phụ thuộc gateway. Gọi RPC trực tiếp (hoặc gateway thiếu pipe) sẽ gây `NaN` ở offset/limit trong tuition/exercise/report (không dùng `?? default`).
4. **Role không được truyền qua RPC**: payload chỉ có `userId`. Tutor tự tra role từ DB khi cần (class list, dashboard), nhưng create class/tuition/exercise không kiểm tra role (TUT-02, TUT-07). Gateway cũng không gắn `@Roles` cho các route này.
5. **`report.*` RPC** (`report.rpc.controller.ts`) không kiểm tra ADMIN và không nhận `userId`, chỉ dựa vào `@Roles('ADMIN')` của gateway. Ai gửi được vào `tutor_queue` đều đọc được toàn bộ thống kê.
6. **API_ENDPOINTS.md** lệch với schema (TUT-33).
7. **Schema DB**: `CLAUDE.md` nói schema nằm ở `../gateway/src/database/schema.ts` và repo không có bản local, nhưng repo có `src/database/schema.ts` (527 dòng) và import từ đó. Hai bản có thể lệch nhau (đặc biệt `sessions.lessionId` typo, `curriculums.userId` tên cột camelCase). Cần xác minh bản nào là canonical.

## Ghi chú / Cần xác minh

- **Guard trên RPC (Cần xác minh).** `JwtAuthGuard`/`LanguageGuard` được đăng ký bằng `APP_GUARD` và dùng `switchToHttp().getRequest().headers`. Nếu chúng chạy trên handler microservice thì mọi RPC sẽ lỗi (`headers` undefined). Vì tài liệu ghi RPC hoạt động nên có thể guard không áp dụng cho microservice của hybrid app. Cần chạy thử xác nhận. Nếu đúng thì RPC hoàn toàn không có xác thực (chỉ tin gateway và quyền truy cập vào broker). Có thể thêm kiểm tra `context.getType()` để rõ ràng.
- **TUT-09, quyền tool của Claude Agent SDK (Cần xác minh).** Chưa kiểm tra mặc định `permissionMode`/tools của SDK khi chạy headless. Nếu tools được bật mặc định thì `ai.chat` có thể cho phép thực thi tool từ input người dùng (mức nghiêm trọng cao hơn). Model id `claude-sonnet-5`/`claude-opus-5` trong `agents.config.ts` cũng cần đối chiếu với model hợp lệ.
- **TUT-05**: suy luận từ hành vi `PgTimestamp.mapToDriverValue` của drizzle (mode `date`) và comment trong `date.helper.ts`; chưa chạy thực tế.
- **Chat HTTP controller** (`/chat/*`) có trong tutor nhưng gateway không proxy route nào tới chat, nên các endpoint đó chỉ truy cập được trực tiếp qua cổng 8888 của tutor-service. Cần xác nhận chủ ý.
- **Curriculum công khai**: `getAll/getById` curriculum trả mọi giáo trình cho mọi user. Có thể là thiết kế "thư viện dùng chung". Cần PO xác nhận trước khi giới hạn đọc.
- **Gợi ý hiệu năng/ổn định nhỏ (không tính bug)**: `JwtAuthGuard` truy vấn DB `users` ở mỗi request HTTP (chỉ tác động cổng 8888). Class/dashboard dùng `Promise.all` nhiều truy vấn nặng cho mỗi lần tải.
- Chưa review kỹ: các script seed (`scripts/seed-*.ts`), `swaggers/`, `i18n/`, `strategy/` (Google/Facebook strategy không được import), `interceptor` HTTP. Chưa chạy test hay build theo yêu cầu.
- Không có mục "tutor request / phê duyệt" trong code. Nếu có luồng này ở service khác thì nằm ngoài phạm vi repo đã review.
