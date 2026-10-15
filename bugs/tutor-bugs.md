# Báo cáo review tĩnh: tutor service (D:\projects\tutor\src)

Phương pháp: đọc code tĩnh (không build/test, không sửa file nguồn). Chỉ ghi các lỗi đã xác minh bằng cách đọc code. Đường dẫn tính từ `D:\projects\tutor\src`.

## Thống kê

| Mức độ | Số lỗi |
|---|---|
| Critical | 0 |
| High | 4 |
| Medium | 18 |
| Low | 15 |
| **Tổng** | **37** |

---

## HIGH

### TU-01 (High) - Controller curriculum không validate body, update bị mass assignment (chiếm quyền sở hữu)
- File: `features/curriculum/curriculum.controller.ts:72` và `:145`, `features/curriculum/curriculum.repository.ts:162-171`, `features/curriculum/curriculum.service.ts:117`
- Mô tả: `@Body() createCurriculum: CreateCurriculumDto` và `@Body() updateData` không dùng `ZodValidationPipe`. `CreateCurriculumDto` chỉ là type, không có kiểm tra lúc chạy. Repository `update` làm `const updateData = { ...data }` rồi `.set(updateData)`, nên client gửi thêm `userId`, `id`, `createdAt`... sẽ được ghi thẳng vào DB. Tutor sở hữu giáo trình có thể chuyển `userId` sang người khác hoặc đổi `id`. Body sai kiểu (code dài hơn 6 ký tự, grade dài hơn 2 ký tự, thiếu trường bắt buộc) gây lỗi DB 500 thay vì 422.
- Gợi ý: gắn `new ZodValidationPipe(createCurriculumSchema)` / `updateCurriculumSchema` cho cả hai route (và validate trong RPC). Trong repository chỉ whitelist trường cho phép (`subject, code, grade, courseTime, description, gradesId`) và set `updatedAt`.

### TU-02 (High) - addParticipant cho phép thêm bất kỳ ai vào mọi loại hội thoại, bỏ qua kiểm tra quyền chat
- File: `features/chat/conversation.service.ts:236-273`
- Mô tả: Chỉ kiểm tra người gọi là participant. Không kiểm tra loại hội thoại (DIRECT/CLASS/GROUP), không kiểm tra người gọi có phải owner/creator, không gọi `validateChatPermission`, không kiểm tra `newUserId` tồn tại (lỗi FK trả 500). Học sinh trong chat lớp có thể thêm người lạ (kể cả ADMIN hay phụ huynh lớp khác) vào hội thoại lớp và đọc toàn bộ lịch sử tin nhắn. Hội thoại DIRECT cũng biến thành nhóm nhiều người.
- Gợi ý: chỉ cho phép trên hội thoại GROUP, chỉ creator/ADMIN được thêm, validate UUID và sự tồn tại của user, áp dụng quy tắc `validateChatPermission` giữa người gọi và người được thêm.

### TU-03 (High) - createGroupConversation không kiểm tra quyền, không validate input
- File: `features/chat/conversation.service.ts:174-191`, `features/chat/chat.controller.ts:102-113`
- Mô tả: Bất kỳ user nào cũng tạo được nhóm với `participantIds` tùy ý mà không qua `validateChatPermission` (cơ chế phân quyền chat chỉ áp dụng cho DIRECT). Vì vậy học sinh có thể kéo giáo viên, phụ huynh, admin bất kỳ vào nhóm (bypass quy tắc). Không validate `name`, `participantIds` (null gây TypeError 500, id không tồn tại gây FK 500, id trùng nhau gây vi phạm unique `conversation_participants_unique` và 500). Hội thoại đã insert nhưng participants lỗi thì để lại bản ghi mồ côi (không có transaction).
- Gợi ý: dùng Zod cho body, dedupe `participantIds`, kiểm tra từng id theo `validateChatPermission`, bọc trong transaction.

### TU-04 (High) - Danh sách lớp (`getClasses`) lộ email và số điện thoại học sinh cho STUDENT/PARENT
- File: `features/class/class.repository.ts:171-190` (select `email`, `phone`), `features/class/class.service.ts:152-163`
- Mô tả: Service cố ý ẩn contact data của bạn cùng lớp (`toPublicClass`, `toPublicRoster`, xem `class.service.ts:198-228`) với người không phải owner. Nhưng `getClassesService` trả nguyên kết quả `repo.getClasses`, trong đó `students[]` chứa `email`, `phone` của mọi học sinh trong lớp, và scope STUDENT/PARENT trả về các lớp của họ. Học sinh/phụ huynh chỉ cần gọi `GET /classes` là lấy được thông tin liên hệ của cả lớp, vô hiệu hóa kiểm soát ở `getClass` và `getAllStudents`.
- Gợi ý: trong `getClassesService`, nếu `classData.tutorId !== userId` thì lược bỏ `email`, `phone` của students (dùng chung helper với `toPublicClass`), hoặc không select các cột này trong query cho non-owner.

---

## MEDIUM

### TU-05 (Medium) - createClassConversation không kiểm tra quyền truy cập lớp, có side effect và race
- File: `features/chat/conversation.service.ts:193-234`
- Mô tả: Không kiểm tra người gọi là tutor/học sinh/phụ huynh của lớp. User ngoài lớp gọi sẽ tạo ra hội thoại lớp (insert thành công) rồi mới bị Forbidden ở `getConversationById` (side effect không rollback). Participants chỉ snapshot lúc tạo: học sinh ghi danh sau không được thêm, học sinh bị xoá khỏi lớp vẫn còn đọc được chat lớp (`syncStudents` không đụng conversationParticipants). Check-then-insert không atomic nên hai request đồng thời tạo trùng hội thoại CLASS (không có unique trên (class_id, type)).
- Gợi ý: kiểm tra quyền truy cập lớp trước; đồng bộ participants khi thêm/xóa học sinh; thêm unique index và dùng `onConflictDoNothing`/transaction.

### TU-06 (Medium) - markConversationAsRead không kiểm tra người gọi là participant
- File: `features/chat/message.service.ts:102-123`, `features/chat/chat.controller.ts:139-148`
- Mô tả: `POST /chat/conversations/:id/read` gọi thẳng hàm này. Câu `UPDATE messages SET status='READ' WHERE conversation_id = :id AND sender_id != :userId` chạy cho bất kỳ conversationId nào mà không kiểm tra user thuộc hội thoại. Người ngoài có thể đánh dấu "đã đọc" toàn bộ tin nhắn của hội thoại khác (làm sai trạng thái đã xem của người gửi).
- Gợi ý: kiểm tra participant trước (như `getMessages`), hoặc đưa điều kiện participant vào câu update.

### TU-07 (Medium) - WS `message:read` cập nhật trạng thái theo messageId không ràng buộc hội thoại
- File: `features/chat/chat.gateway.ts:207-226`, `features/chat/message.service.ts:92-100`
- Mô tả: Gateway chỉ kiểm tra participant của `data.conversationId`, nhưng `updateMessageStatus(data.messageId, 'READ')` cập nhật theo `messageId` bất kỳ (không kiểm tra message thuộc conversation đó). Participant của hội thoại A có thể đánh dấu READ tin nhắn trong hội thoại B bằng cách gửi `conversationId = A` và `messageId` của B. Ngoài ra không kiểm tra người đọc không phải người gửi.
- Gợi ý: update với điều kiện `messages.id = :id AND messages.conversation_id = :conversationId AND sender_id != :userId`.

### TU-08 (Medium) - Chat không validate input (nội dung tin nhắn, limit, body các endpoint)
- File: `features/chat/chat.gateway.ts:101-113`, `features/chat/message.service.ts:58-82`, `features/chat/chat.controller.ts:85` và `:89-137`
- Mô tả: Nội dung tin nhắn không kiểm tra kiểu/độ dài/rỗng (gửi chuỗi hàng MB hoặc `null` gây lỗi DB hoặc phình dữ liệu). `limit` lấy bằng `parseInt` không giới hạn trên: `limit=abc` cho NaN gây lỗi SQL 500, `limit=1000000` cho phép kéo hàng loạt dữ liệu. Các body `targetUserId`, `name`, `participantIds`, `userId` không qua Zod, `id` không phải UUID gây lỗi `22P02` 500. `before` không ràng buộc cùng hội thoại.
- Gợi ý: dùng ZodValidationPipe (uuid, `limit` 1-100, `content` 1-5000 ký tự), validate payload WS.

### TU-09 (Medium) - Dashboard của STUDENT lộ doanh thu theo tháng của cả lớp
- File: `features/dashboard/dashboard.service.ts:103`, `features/dashboard/dashboard.repository.ts:272-290`
- Mô tả: Với STUDENT, `revenueThisMonth` được đặt 0 để ẩn, nhưng `getMonthlyRevenue(scope, year)` vẫn chạy với `scope = studentClassScope` và không lọc theo `studentId`. Kết quả `monthly[].revenue` và `cumulativeRevenue` là tổng học phí PAID của mọi học sinh trong các lớp của học sinh đó (dữ liệu tài chính của người khác). Tương tự `newStudents` thống kê toàn lớp.
- Gợi ý: với student chỉ tính theo `tuitions.studentId = userId` hoặc trả 0 cho các trường doanh thu/tổng hợp lớp.

### TU-10 (Medium) - Điểm danh trả ghi chú của giáo viên về từng học sinh cho mọi học sinh/phụ huynh trong lớp
- File: `features/attendance/attendance.service.ts:29-57`
- Mô tả: `getBySessionService` cho phép owner, học sinh đã ghi danh và phụ huynh, nhưng trả toàn bộ roster kèm `present`, `note` của TỪNG học sinh. Học sinh/phụ huynh thấy ghi chú riêng và trạng thái vắng của bạn cùng lớp.
- Gợi ý: với non-owner chỉ trả bản ghi của chính học sinh (hoặc con của phụ huynh), bỏ `note` của người khác.

### TU-11 (Medium) - createExercise cho phép giả mạo bài nộp (student/tutor không được xác minh quan hệ)
- File: `features/exercise/exercise.service.ts:66-109`
- Mô tả: Chỉ yêu cầu `userId` là studentId hoặc tutorId. (a) Khi `sessionId` rỗng, học sinh có thể đặt `tutorId` = bất kỳ user nào, tạo bài nộp xuất hiện trong danh sách của user đó (spam) và không có giới hạn trùng lặp. (b) Người gọi là tutorId (kể cả tutor không phải của lớp nếu không có sessionId) có thể tạo bài nộp thay cho bất kỳ `studentId`. Khi có `sessionId` vẫn không kiểm tra học sinh có ghi danh lớp đó; `lessonId` không cần thuộc giáo trình của lớp. Không kiểm tra `issueUrls/exerciseUrls[].url` là URL hợp lệ (schema chỉ `z.string()`).
- Gợi ý: bắt buộc `sessionId` (hoặc xác thực tutor-học sinh qua lớp), kiểm tra học sinh ghi danh, kiểm tra tutor là tutor của lớp, chỉ cho phép student tự nộp (`studentId = userId`).

### TU-12 (Medium) - updateSession bỏ qua kiểm tra tham chiếu lessonId/tutorId
- File: `features/session/session.service.ts:167-178`, `features/session/session.repository.ts:221-247`
- Mô tả: `create` gọi `resolveSessionRefs` để validate lesson/tutor, nhưng `update` truyền thẳng `data` xuống repository. `lessonId`, `tutorId` không được kiểm tra tồn tại (FK lỗi trả 500/400 mơ hồ), `lessonId` có thể thuộc giáo trình của người khác/khác lớp. `tutorId: null` được set (schema cho nullable). Cũng không kiểm tra `endAt > startAt` khi sửa riêng từng trường.
- Gợi ý: gọi `resolveSessionRefs` khi `data.lessonId`/`data.tutorId` có mặt; kiểm tra lesson thuộc `class.curriculumId`; validate thứ tự thời gian sau khi merge với dữ liệu hiện có.

### TU-13 (Medium) - Tạo giáo trình luôn bỏ `gradesId`, create và update không nhất quán
- File: `features/curriculum/curriculum.repository.ts:29` (`gradesId: null`), `:162-171`
- Mô tả: Schema bắt buộc `gradesId` (uuid) nhưng `create` luôn ghi `gradesId: null`, dữ liệu khối lớp người dùng gửi lên bị mất. `update` lại ghi `gradesId` (do spread). Cột `updated_at` không được cập nhật trong `update`.
- Gợi ý: ghi `gradesId: data.gradesId` ở create (kiểm tra tồn tại), set `updatedAt: new Date()` ở update.

### TU-14 (Medium) - Giáo trình/chương/bài học đọc không kiểm soát truy cập; tài liệu bài tập lộ cho học sinh trước khi buổi học kết thúc
- File: `features/curriculum/curriculum.service.ts:58-91`, `features/chapter/chapter.service.ts:49-62`, `features/lesson/lesson.service.ts:54-70`, `features/class/class.service.ts:301-320`
- Mô tả: Mọi user đã đăng nhập (kể cả học sinh) đọc được mọi curriculum/chapter/lesson (chỉ kiểm tra user tồn tại, hoặc không kiểm tra gì với chapter/lesson), kèm `theoryUrls` và `exerciseUrls`. Trong khi `SessionService.gateExercises` và `getClassWatchService` cố ý ẩn `exerciseUrls` khỏi non-owner đến khi session COMPLETED. `getClassMaterialsService` cũng trả `exerciseUrls` của mọi bài học cho học sinh/phụ huynh. Cơ chế "ẩn bài tập" dễ bị bypass.
- Gợi ý: giới hạn đọc theo chủ sở hữu hoặc theo lớp mà user thuộc về; che `exerciseUrls` với non-owner ở các endpoint trên.

### TU-15 (Medium) - Lesson create/update không kiểm tra `chapterId` thuộc cùng giáo trình
- File: `features/lesson/lesson.service.ts:44-51`, `:84-90`, `features/lesson/lesson.repository.ts:86-89`
- Mô tả: Chỉ kiểm tra định dạng UUID của `chapterId`; không kiểm tra chương tồn tại và thuộc cùng curriculum. Có thể gắn bài học vào chương của giáo trình khác (kể cả của người khác), làm sai dữ liệu và hiển thị lẫn (id không tồn tại thì lỗi FK thành 500). `update` set thẳng `data` (gồm cả `chapterId`).
- Gợi ý: truy vấn chapter, kiểm tra `chapter.curriculumId === curriculumId`.

### TU-16 (Medium) - Trạng thái online sai khi user mở nhiều tab/thiết bị
- File: `features/chat/chat.gateway.ts:40`, `:82`, `:93-99`
- Mô tả: `onlineUsers` là Map `userId -> socketId` (một socket). Tab thứ hai ghi đè socketId; khi bất kỳ tab nào ngắt kết nối thì `delete(userId)` và phát `offline` dù user vẫn còn tab khác. `sendToUser` chỉ gửi tới socket cuối cùng. Không dùng được khi chạy nhiều instance.
- Gợi ý: lưu `Map<userId, Set<socketId>>`, chỉ offline khi Set rỗng; xem xét dùng room `user:{id}` hoặc Redis adapter.

### TU-17 (Medium) - updateClass: đồng bộ học sinh không atomic, không bắt lỗi unique khi update
- File: `features/class/class.service.ts:134-149`, `features/class/class.repository.ts:87-101`
- Mô tả: `syncStudents` (DELETE rồi INSERT, hai câu riêng lẻ không có transaction) chạy trước `repo.update`. Nếu insert/update sau lỗi (FK, trùng tên/mã do race) thì danh sách học sinh đã bị xóa một phần nhưng lớp không đổi. Kiểm tra trùng name/code là check-then-act; khác `create`, `update` không bắt lỗi `23505` nên trả 500. `curriculumId` không được kiểm tra tồn tại.
- Gợi ý: bọc trong transaction, cập nhật thông tin lớp trước rồi sync, bắt `23505` trả 400.

### TU-18 (Medium) - ErrorInterceptor trả nguyên thông điệp lỗi nội bộ và ánh xạ sai mã lỗi
- File: `packages/interceptor/error.interceptor.ts:224-264`
- Mô tả: Với lỗi không phải HttpException và không phải mã PG đã liệt kê, `clientMessage` là `error.message` thô (TypeError, lỗi thư viện...), trả về client. Mã `22P02` (UUID sai định dạng, rất dễ gặp ở chat, nơi id không được validate) không được ánh xạ nên trả 500 thay vì 400; lỗi unique `23505` cũng thành 500 (RPC thì ánh xạ 409, HTTP không). Do drizzle bọc lỗi, `e.code` thường nằm ở `cause`, mã chỉ khớp một phần.
- Gợi ý: dùng bảng ánh xạ chung với `RpcExceptionFilter` (400/409), luôn trả thông điệp chung cho 5xx và chỉ ghi chi tiết vào log.

### TU-19 (Medium) - Endpoint AI tiêu tốn tài nguyên trả phí mà không giới hạn
- File: `features/agents/agents.controller.ts:7-11`, `features/agents/agents.service.ts:58-71`, `features/agents/agents.rpc.controller.ts:16-19`
- Mô tả: `POST /run` chạy một phiên Claude Agent SDK với bất kỳ JWT hợp lệ (kể cả học sinh), không giới hạn role/rate. `ai.chat` cũng không có rate limit, không timeout, chạy đồng thời không giới hạn; map `history` theo userId tăng vô hạn theo số user (chỉ giới hạn 100 tin/user). Có thể gây tốn chi phí/DoS.
- Gợi ý: thêm `@Roles('ADMIN')` hoặc xóa `/run`, thêm throttling theo user, timeout/AbortController, hàng đợi giới hạn đồng thời.

### TU-20 (Medium) - Danh sách "có thể chat" không khớp quy tắc cấp quyền tạo hội thoại
- File: `features/chat/conversation.service.ts:413-464` (validateChatPermission) so với `:697-706` (STUDENT liệt kê ADMIN) và `:763-772` (PARENT liệt kê ADMIN)
- Mô tả: `getChatableUsers` liệt kê ADMIN cho STUDENT và PARENT, nhưng `validateChatPermission` ném Forbidden khi STUDENT/PARENT chat trực tiếp với ADMIN (không có nhánh nào cho ADMIN). Phía UI user bấm vào sẽ nhận lỗi 403. Danh sách của STUDENT/TUTOR cũng gồm user `isActive=false` (chỉ ADMIN mới lọc `isActive`).
- Gợi ý: thống nhất một hàm quyền dùng cho cả hai nơi; lọc `isActive` ở mọi nhánh.

### TU-21 (Medium) - JwtAuthGuard và WS gateway không kiểm tra tài khoản bị khóa, role lấy từ token
- File: `packages/guards/jwt-auth.guard.ts:98-107`, `packages/guards/jwt-auth.guard.ts:39-45`, `features/chat/chat.gateway.ts:70-80`
- Mô tả: Guard chỉ kiểm tra user còn tồn tại trong DB, không kiểm tra `users.isActive`; tài khoản bị vô hiệu hóa vẫn dùng được token (tối đa 3 giờ) và socket đã kết nối không bao giờ bị kiểm tra lại. `role` lấy từ payload token, không đối chiếu DB nên đổi role/hạ quyền ADMIN không có hiệu lực đến khi token hết hạn (report `ADMIN` đọc từ token). Giá trị role lạ được chuyển thành `STUDENT` thay vì từ chối.
- Gợi ý: lấy `role` và `isActive` từ bản ghi DB vừa truy vấn (guard đã select user), từ chối khi `isActive=false`, ngắt socket khi token hết hạn.

### TU-22 (Medium) - Tạo học phí với status PAID không gán paidDate, doanh thu biến mất khỏi báo cáo
- File: `features/tuition/tuition.service.ts:16-32` (so với `:64-69`), `features/tuition/tuition.repository.ts:69-83`, `features/dashboard/dashboard.repository.ts:228-290`
- Mô tả: Chỉ `update` mới tự gán `paidDate` khi chuyển sang PAID. `create` với `status: 'PAID'` và không có `paidDate` ghi `paidDate = null`. Dashboard tính doanh thu theo `paidDate` trong khoảng tháng/năm nên khoản đã thu này không bao giờ xuất hiện trong `revenueThisMonth` và `monthly`. Ngoài ra không chặn tạo nhiều bản ghi học phí trùng cho cùng học sinh/lớp.
- Gợi ý: áp dụng cùng logic gán `paidDate` ở create; hoặc ràng buộc DB `status='PAID' => paid_date IS NOT NULL`.

---

## LOW

### TU-23 (Low) - Tutor chat với phụ huynh chỉ kiểm tra đứa con đầu tiên
- File: `features/chat/conversation.service.ts:477-486`
- Mô tả: Với target PARENT, `checkTutorStudentAccess` lấy `child` đầu tiên (`limit(1)`) và chỉ kiểm tra lớp của đứa đó. Phụ huynh có nhiều con mà con đầu không học lớp của tutor sẽ bị từ chối sai. Danh sách `getChatableUsers` (dùng `users.parentId IN studentIds`) vẫn liệt kê phụ huynh này.
- Gợi ý: kiểm tra tất cả con (`inArray`).

### TU-24 (Low) - CORS mở hoàn toàn kèm credentials, Swagger public
- File: `main.ts:26` (`origin: true, credentials: true`), `main.ts:97-102`, `features/chat/chat.gateway.ts:29-35`
- Mô tả: Phản chiếu mọi Origin cùng `credentials: true` cho HTTP và Socket.IO. Tài liệu Swagger `/api-docs` được bật vô điều kiện cả ở production.
- Gợi ý: cấu hình whitelist origin từ env; tắt Swagger ở production hoặc bảo vệ.

### TU-25 (Low) - Thiếu kiểm tra thứ tự thời gian (kết thúc phải sau bắt đầu)
- File: `packages/entities/class/class.schema.ts:20-21`, `packages/entities/session/session.schema.ts:32-33`, `:76-77`, `packages/entities/schedule/schedule.schema.ts:27-34`, `:60-63`
- Mô tả: Lớp (`startTime/endTime`), buổi học (`startAt/endAt`), lịch học (`startTime/endTime`) cho phép thời điểm kết thúc trước bắt đầu hoặc bằng nhau. Cũng không có giới hạn độ dài cho `description`, `note`, `location`, `comment`.
- Gợi ý: thêm `.refine` so sánh; giới hạn độ dài chuỗi.

### TU-26 (Low) - Ký tự đại diện LIKE không được escape trong tìm kiếm
- File: `packages/helpers/queryList.helper.ts:43`
- Mô tả: `%${search}%` truyền vào `ilike` mà không escape `%`, `_`, `\`. Người dùng nhập `%` hoặc `_` khớp mọi bản ghi, có thể tạo pattern tốn CPU (không phải SQL injection do có tham số hóa).
- Gợi ý: escape các ký tự đặc biệt trước khi ghép pattern.

### TU-27 (Low) - Mã lớp/giáo trình sinh bằng Math.random và kiểm tra trùng không bảo đảm
- File: `packages/helpers/generate.helper.ts:13`, `features/class/class.service.ts:31-45`, `features/curriculum/curriculum.service.ts:23-37`
- Mô tả: Mã 6 ký tự từ `Math.random()` (không an toàn mật mã, không gian 36^6 nhỏ). Việc sinh mã chỉ kiểm tra rồi trả, không giữ chỗ nên hai người nhận cùng mã (race) rồi một người gặp lỗi unique; `createCurriculumService` không kiểm tra trùng `code` (cột `curriculums.code` không unique, nên có thể trùng mã giáo trình).
- Gợi ý: dùng `crypto.randomInt`; bắt unique violation khi tạo; thêm unique cho `curriculums.code` nếu nghiệp vụ yêu cầu.

### TU-28 (Low) - Chuyển trạng thái học phí không nhất quán với paidDate
- File: `features/tuition/tuition.service.ts:54-71`
- Mô tả: Chuyển từ PAID sang UNPAID/OVERDUE không xóa `paidDate`; có thể gửi `paidDate` khi status khác PAID; `status` PAID + `paidDate: null` được chấp nhận (doanh thu biến mất). `amount` không có giới hạn trên (cột `numeric(14,2)` có thể tràn gây 500).
- Gợi ý: chuẩn hóa `paidDate` theo status, thêm `.max` cho `amount`.

### TU-29 (Low) - Race condition ở bài nộp: không có unique (student, session), TOCTOU khi nộp lại/chấm
- File: `features/exercise/exercise.service.ts:96-107`, `:141-155`, `:170-185`; `database/schema.ts:338-358`
- Mô tả: Kiểm tra "một bài nộp mỗi (student, session)" là check-then-insert, bảng `exercises` không có unique index nên yêu cầu đồng thời tạo trùng. `submitExercise` kiểm tra `status !== GRADED` rồi update không có điều kiện trạng thái trong `WHERE`, nên học sinh nộp lại có thể ghi đè bài ngay sau khi tutor chấm (status bị đặt lại SUBMITTED, điểm cũ còn nhưng trạng thái sai).
- Gợi ý: thêm unique index `(student_id, session_id)`, thêm điều kiện `status <> 'GRADED'` vào câu UPDATE.

### TU-30 (Low) - Phạm vi truy cập không nhất quán giữa các endpoint (phụ huynh, admin)
- File: `features/session/session.repository.ts:102-105`, `features/class/class.repository.ts:128-144`
- Mô tả: `getSessionService` cho phụ huynh xem buổi học của con, nhưng `getAll` (danh sách buổi học) chỉ lấy lớp sở hữu hoặc ghi danh nên phụ huynh nhận danh sách rỗng. Với danh sách lớp, ADMIN rơi vào nhánh `else` và chỉ thấy lớp mình làm tutor.
- Gợi ý: thêm nhánh PARENT/ADMIN thống nhất.

### TU-31 (Low) - Dashboard: PARENT/ADMIN dùng scope của tutor, mốc thời gian theo múi giờ server
- File: `features/dashboard/dashboard.service.ts:63-77`
- Mô tả: Chỉ STUDENT có scope học sinh; PARENT bị xem như tutor (kết quả toàn 0). Các mốc ngày/tuần/tháng tính bằng giờ địa phương của server (`setHours`, `new Date(y, m, 1)`) nên lệch với múi giờ người dùng.
- Gợi ý: thêm scope cho PARENT, dùng múi giờ cố định (Asia/Ho_Chi_Minh) khi tính biên.

### TU-32 (Low) - Log RPC gửi sang third-service chứa nội dung riêng tư (chat AI, ghi chú, nhận xét)
- File: `packages/interceptor/trace-context.interceptor.ts:22-33`, `:54-75`
- Mô tả: `SENSITIVE_KEYS` chỉ che password/token/email/phone. Payload `ai.chat` (`message`), `reply.content`, `note`, `comment`, `exerciseUrls[].url` được ghi vào bảng `request_logs` (tới 1000 ký tự) ở dạng rõ.
- Gợi ý: bổ sung khóa (`message`, `content`, `note`, `comment`, `url`) hoặc không log body với các pattern nhạy cảm.

### TU-33 (Low) - TraceContextInterceptor không hủy subscription khi bên gọi hủy
- File: `packages/interceptor/trace-context.interceptor.ts:147-196`
- Mô tả: `new Observable` subscribe vào `next.handle()` nhưng không trả teardown function; khi subscriber hủy (timeout phía gateway), xử lý bên trong vẫn chạy và log hoàn tất không phản ánh đúng.
- Gợi ý: lưu `Subscription` và trả `() => sub.unsubscribe()`.

### TU-34 (Low) - Các RPC controller tin hoàn toàn payload (userId, DTO) không validate
- File: `features/*/*.rpc.controller.ts` (ví dụ `class.rpc.controller.ts:20-69`, `session.rpc.controller.ts:89-122`, `curriculum.rpc.controller.ts:24-47`, `agents.rpc.controller.ts:16-29`), `main.ts:42-43`
- Mô tả: Handler `@MessagePattern` nhận `{ userId, data }` và chuyển thẳng vào service, không dùng `ZodValidationPipe`; kiểu DTO chỉ là type. Quyền hoàn toàn dựa vào việc gateway đã xác thực và validate. Bất kỳ client nào publish được vào `tutor_queue` đều giả mạo được `userId` (xem thêm TU-01). URL mặc định của broker là `guest:guest@localhost`.
- Gợi ý: validate lại bằng Zod ở RPC (defense in depth), đảm bảo broker có xác thực và ACL, không dùng thông tin đăng nhập mặc định ở production.

### TU-35 (Low) - Xóa lớp: TOCTOU giữa kiểm tra lịch sử học phí và xóa
- File: `features/class/class.service.ts:289-294`
- Mô tả: `hasTuitionHistory` rồi `delClass` là hai bước riêng; học phí tạo xen giữa sẽ bị `ON DELETE CASCADE` xóa mất cùng lớp (mất dữ liệu tài chính mà code định bảo vệ).
- Gợi ý: thực hiện trong transaction với khóa, hoặc đổi FK `tuitions.class_id` sang `RESTRICT`.

### TU-36 (Low) - Trợ lý AI không dùng lịch sử hội thoại, lịch sử chỉ nằm trong bộ nhớ
- File: `features/agents/agents.service.ts:58-71`
- Mô tả: `chat` gọi `run(data.message)` chỉ với tin nhắn hiện tại; `history` chỉ được lưu để trả về, không được đưa vào prompt nên trợ lý không nhớ ngữ cảnh. Lịch sử mất khi restart và không đồng bộ giữa nhiều instance (dù schema có bảng `aiMessages`). Hai request đồng thời cùng user có thể xen kẽ thứ tự.
- Gợi ý: lưu vào bảng `ai_messages` và đưa N tin gần nhất vào prompt.

### TU-37 (Low) - Phát sóng trạng thái online cho mọi socket và lộ danh sách người đang online
- File: `features/chat/chat.gateway.ts:84`, `:96`, `:201-205`
- Mô tả: `server.emit('user:status')` gửi tới tất cả socket trong namespace và `user:get-online` trả toàn bộ userId đang online cho bất kỳ user nào, không phân biệt quan hệ.
- Gợi ý: chỉ phát tới các room/hội thoại mà user tham gia, lọc danh sách online theo quan hệ.
