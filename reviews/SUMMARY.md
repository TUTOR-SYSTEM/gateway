# Report tổng kết: bug còn sót trong project

- **Ngày review:** 2026-10-11
- **Phạm vi:** 5 source `ui`, `gateway`, `user`, `tutor`, `third`
- **Cách review:** 5 sub agent (Sonnet) review song song bằng cách đọc code tĩnh, không sửa file nguồn, không chạy build/test. Sau đó tổng hợp và xác minh lại các lỗi Critical về phân quyền.

Report chi tiết của từng source:

| Source | Report |
|---|---|
| ui | [ui-review.md](ui-review.md) |
| gateway | [gateway-review.md](gateway-review.md) |
| user | [user-review.md](user-review.md) |
| tutor | [tutor-review.md](tutor-review.md) |
| third | [third-review.md](third-review.md) |

## 1. Thống kê

| Source | Critical | High | Medium | Low | Tổng |
|---|---:|---:|---:|---:|---:|
| gateway | 5 | 7 | 12 | 5 | 29 |
| user | 2 | 7 | 15 | 7 | 31 |
| tutor | 2 | 6 | 15 | 10 | 33 |
| third | 2 | 6 | 15 | 5 | 28 |
| ui | 0 | 6 | 12 | 8 | 26 |
| **Tổng** | **11** | **32** | **69** | **35** | **147** |

Bảng trên là số liệu gốc của từng report. Nhiều lỗi xuất hiện ở hai service (gateway và service phía sau). Sau khi gộp các lỗi trùng, còn khoảng **7 vấn đề Critical độc lập** (mục 2).

## 2. Vấn đề Critical (đã gộp lỗi trùng)

| # | Vấn đề | ID liên quan | Trạng thái | Hậu quả |
|---|---|---|---|---|
| C1 | **Leo thang quyền lên ADMIN.** Gateway `user.controller.ts` không có `@Roles` nào. `PUT /users/:id` gọi `user.updateUserByAdmin`, hàm này ghi mọi field, kể cả `role` và `isActive`. Các route `POST /users`, `DELETE /users/:id`, `PUT /users/:id/status`, `GET /users/get-by-field` cũng không có guard. | GW-02, USR-01 | **Đã xác minh** | User thường tự gán role ADMIN cho mình, tạo admin, xoá hoặc khoá bất kỳ ai, tra PII của người khác. |
| C2 | **Đọc key Redis tuỳ ý.** `GET /redis?key=` và RPC `redis.get` không giới hạn prefix hay role. | GW-05, TRD-01 | Report xác nhận ở cả 2 service | Đọc `session:*` và `reset-password:*`, từ đó chiếm tài khoản. |
| C3 | **Upload R2 mở công khai.** Upload, tải và xoá file đều `@Public()`, không giới hạn key hay kích thước. | GW-03, TRD-02 | Report xác nhận ở cả 2 service | Ai cũng xoá hoặc tải được mọi file, hoặc lạm dụng bucket. |
| C4 | **Mật khẩu mặc định cố định.** Học sinh và phụ huynh được tạo với `Student@123456` / `Parent@123456`. `/auth/login/user-code` chỉ cần `userCode` 6 ký tự sinh bằng `Math.random`. | USR-02 | **Đã xác minh** (`student.service.ts:103,113,308`) | Đoán hoặc brute-force được để chiếm tài khoản học sinh và phụ huynh. |
| C5 | **IDOR giáo trình.** Sửa/xoá curriculum, chapter và lesson không kiểm tra chủ sở hữu. Gateway không truyền `userId` cho chapter và lesson. | TUT-01, GW-11 | Report xác nhận ở cả 2 phía | User bất kỳ sửa hoặc xoá giáo trình của tutor khác, kéo theo xoá luôn chapter và lesson. |
| C6 | **Tự nhận làm tutor của lớp.** `POST /classes` không kiểm tra role và lấy `tutorId` từ body. | TUT-02 | Report | Học sinh tự làm tutor, ghi danh học sinh khác, đọc PII của họ, tạo bản ghi học phí. |
| C7 | **Reset mật khẩu không dùng được.** `POST /auth/reset-password` thiếu `@Public()` ở cả gateway và user-service. | GW-04, USR-06 | **Đã xác minh** (`gateway auth.controller.ts:223-224`) | Lỗi chức năng: luồng quên mật khẩu luôn trả 401. |

> **Điều chỉnh mức độ GW-01:** report gateway xếp GW-01 (`PUT /users` tự sửa `role`) là Critical. Khi xác minh, user-service có chặn `role`, `isActive` và `userCode` trong `updateOwnProfileService` qua `SELF_UPDATE_RESTRICTED_FIELDS`, nên đường này **không** leo thang được quyền. Tuy vậy gateway spread DTO sau `role: _user.role`, nên client ghi đè được tham số `role` gửi xuống. Kết quả là học sinh gửi `role: "TUTOR"` thì vượt qua được rule "STUDENT không được đổi tên". Mức độ thực tế: **Medium**. Leo thang quyền thật sự đi qua C1.

## 3. Vấn đề High theo nhóm

### 3.1 Phân quyền và IDOR
- Notification: đọc, đánh dấu đã đọc, xoá chỉ theo `id`. `POST /notifications` cho mọi role gửi tới bất kỳ ai (GW-12, TRD-04).
- `PUT/DELETE/GET /students/:id` gọi `user.updateUser` và `user.deleteUserByAdmin` với id lấy từ URL, không có role guard (GW-10, USR tích hợp).
- `/admin/tutors` và `/admin/students` không gắn `role` khi tạo hoặc liệt kê, nên tạo sai role và trả lẫn user (GW-08, GW-09).
- WebSocket chat không kiểm tra thành viên. Ai cũng vào được room, đọc tin nhắn và đánh dấu đã đọc thay người khác (TUT-06).
- Học sinh tự đặt `tutorId` là mình để tự chấm bài tập (TUT-07).
- `POST /run` của tutor mở công khai và không throttle, ai cũng kích hoạt được Claude Agent và gây tốn chi phí (TUT-08).

### 3.2 Xác thực, session và bí mật
- Thiếu biến môi trường JWT secret thì dùng secret cứng `'dev-insecure-jwt-secret'`, có thể giả JWT (TRD-03). Cần kiểm tra cả `user`, `tutor` và `gateway` xem có fallback tương tự không.
- Đổi hoặc reset mật khẩu, khoá, xoá user không thu hồi session Redis, nên refresh token cũ vẫn dùng được 7 ngày (USR-07).
- Đăng ký không xác minh email, OAuth gộp tài khoản theo email, nên có thể bị chiếm tài khoản trước (pre-hijack) (USR-09).
- UI lưu token ở hai nơi, logout không xoá hết. Logout cũng không `queryClient.clear()`, user sau thấy cache của user trước (UI-05, UI-06).

### 3.3 Lộ dữ liệu nhạy cảm
- `POST/PUT /students` trả cả password hash (USR-04).
- `console.log` in mật khẩu mới và `jti` khi reset (USR-05).
- `request_logs` lưu body RPC gần như nguyên văn, kể cả giá trị Redis và token reset, và còn phát qua websocket (TRD-05).
- `RpcExceptionFilter` trả nguyên message lỗi DB (SQL, params) về gateway (USR-03).

### 3.4 Độ tin cậy RabbitMQ và hạ tầng (lỗi hệ thống, ảnh hưởng mọi service)
- Gateway retry mọi lỗi, kể cả 4xx nghiệp vụ và timeout, tối đa 3 lần với timeout cố định 10s. Các service phía sau lại auto-ack và không có DLQ. Hậu quả: tạo bản ghi trùng, `ai.chat` và `testscenario.run` bị chạy lại tới 3 lần, crash giữa chừng thì mất message (GW-06, GW-07, TRD-08, TUT-15).
- Redis không có command timeout. Redis chết thì mọi request treo vì `TokenBucketGuard` chạy trên toàn bộ request (TRD-07).
- `stream.pipe(res)` khi tải file không có handler lỗi, có thể crash process (TRD-06).

### 3.5 Toàn vẹn dữ liệu
- Zod `.default()` nằm trong `.partial()` nên cập nhật một phần ghi đè bằng giá trị mặc định. Học phí PAID về UNPAID, lớp về `tuition=0`, `status=OPEN`, `format=OFFLINE`, `order` của chapter/lesson bị reset (TUT-03, TUT-04, TUT-12).
- `parentId` và `tutorId` dùng `onDelete: cascade`, nên xoá một tutor xoá luôn toàn bộ học sinh và phụ huynh của họ (USR-08).
- Lọc ngày của session truyền chuỗi ISO vào cột timestamp, có thể gây lỗi (TUT-05, cần chạy thử để xác nhận).

## 4. Lệch hợp đồng API giữa UI, Gateway và Service

| Vấn đề | Phía gọi | Phía nhận | ID |
|---|---|---|---|
| Tạo/sửa buổi học gửi `date/startTime/endTime` | ui | gateway yêu cầu `startAt/endAt/sessionNumber`: tạo bị 422, sửa bị bỏ qua im lặng | UI-02, UI-03 |
| `PATCH /sessions/:id` | ui | gateway chỉ có `PUT`, trả 404 | UI-04 |
| `/chat/*` (REST và socket) | ui | gateway không có controller chat, trang Discussions không dùng được | UI-11 |
| `/users/avatar`, `/users/grades`, `/curriculum/grades`, `/curriculum/by-grade/:id`, upload/xoá file bài học | ui | gateway không có route | UI-12 đến UI-14 |
| `/students/*` gọi `user.updateUser` và `user.deleteUserByAdmin` | gateway | user-service: sai ngữ nghĩa, có thể sửa hồ sơ người khác | GW-10 |
| `/admin/tutors` và `/admin/students` không gửi `role` | gateway | user-service | GW-08, GW-09 |
| Chapter/lesson RPC không có `userId` | gateway | tutor-service | GW-11, TUT-01 |
| AI chat parse sai cấu trúc message của SDK, gần như luôn trả "no response" | tutor | Claude Agent SDK | TUT-09 |

## 5. Tài liệu lỗi thời
- Tài liệu architecture của `third` nói dùng Kafka nhưng code dùng RabbitMQ.
- `CLAUDE.md` của `user` nói có RPC handler `admin.*` và `student.*`, thực tế chỉ có `auth.*` và `user.*`.
- `ui/lib/api-gaps/gap-report.json` đã lỗi thời.
- `architech/tutor-management-request.sequence.json` được nhắc tới nhưng không tồn tại. Tutor service cũng không có luồng duyệt yêu cầu tutor.

## 6. Cần xác minh thêm (chưa chạy thử)
1. JWT `APP_GUARD` có chạy trên các handler RPC trong hybrid app không. Nếu không, RPC không tự xác thực và an toàn chỉ dựa vào gateway cùng việc broker không bị expose (tutor, third).
2. Cổng HTTP của `user`, `tutor` và `third` có bị expose ra ngoài không. Điều này quyết định mức độ của TRD-02, TUT-08 và các route `@Public()` ở service.
3. Giá trị mặc định `noAck` của RMQ transport trong phiên bản NestJS đang dùng (user, tutor).
4. Gateway có chuyển tiếp nguyên message lỗi DB từ RPC về client không (USR-03).
5. Quyền tool mặc định của Claude Agent SDK trong AI chat và `/run` (TUT-08).

## 7. Thứ tự sửa đề xuất

**Ưu tiên 0 (ngay lập tức, lỗ hổng bảo mật bị khai thác được):**
1. Thêm `@UseGuards(RolesGuard) @Roles('ADMIN')` cho các route admin ở gateway `user.controller.ts`, đồng thời kiểm tra role ngay trong RPC handler của user-service (C1).
2. Xoá hoặc chặn `GET /redis` và RPC `redis.get` cho client. Nếu cần giữ, chỉ cho ADMIN và whitelist prefix (C2).
3. Bỏ `@Public()` ở các route upload, giới hạn key theo owner và giới hạn kích thước file (C3).
4. Sinh mật khẩu ngẫu nhiên cho học sinh/phụ huynh và bắt đổi ở lần đăng nhập đầu. Thêm rate-limit cho `/auth/login/user-code` và sinh `userCode` bằng `crypto` (C4).
5. Kiểm tra ownership cho curriculum, chapter, lesson, class, notification, exercise và chat socket (C5, C6, mục 3.1).
6. Fail-fast khi thiếu JWT secret, không fallback. Xoá `console.log` mật khẩu. Không trả password hash. Mở rộng danh sách redact của `request_logs`.

**Ưu tiên 1 (chức năng hỏng):**
7. Thêm `@Public()` cho `/auth/reset-password` (C7).
8. Sửa các payload và route lệch giữa UI và gateway (mục 4), thêm module chat ở gateway.
9. Sửa schema update bỏ `.default()` khỏi `.partial()` (TUT-03, TUT-04, TUT-12).
10. Sửa socket provider để kết nối lại khi có token (UI-01). Logout xoá cả hai nơi lưu token và cache.

**Ưu tiên 2 (độ tin cậy):**
11. Chỉ retry lỗi hạ tầng (không retry 4xx), retry với idempotency key. Timeout riêng cho `ai.chat` và `testscenario.*`. Bật `noAck: false` và thêm DLQ.
12. Thu hồi session khi đổi mật khẩu, khoá hoặc xoá user. Đổi `onDelete: cascade` của `parentId`/`tutorId` sang `set null`.
13. Thêm timeout cho Redis và handler lỗi cho stream tải file.

**Ưu tiên 3:** các mục Medium và Low trong từng report.
