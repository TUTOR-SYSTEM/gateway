# Tổng hợp bug còn sót — vòng 3 (2026-10-13)

- **Phạm vi:** 5 repo `gateway`, `user` (USER), `tutor` (tutor-service), `third` (THIRD_SERVICE), `ui` (TUTOR-UI).
- **Cách review:** 5 sub agent đọc code tĩnh song song, không sửa source, không commit, không chạy DB/RMQ/HTTP. Mỗi agent đối chiếu với `gateway/reviews/` (vòng 1 và round2) để đánh dấu MỚI / CÒN / ĐÃ SỬA.
- **Lưu ý:** số lượng dưới đây là số agent báo cáo, chưa đếm lại độc lập. Mục "chưa xác minh" trong từng báo cáo cần chạy runtime mới chốt được.

## 1. Thống kê

| Repo | Báo cáo | Critical | High | Medium | Low | Tổng | Ghi chú |
|---|---|---:|---:|---:|---:|---:|---|
| gateway | [gateway.md](gateway.md) | 2 | 6 | 8 | 14 | 30 | 6 mới, 24 còn |
| user | [user.md](user.md) | 4 | 9 | 23 | 12 | 48 | 5 mới, 43 còn |
| tutor | [tutor.md](tutor.md) | 1 | 7 | 23 | 16 | 47 | 7 mới, 40 còn |
| third | [third.md](third.md) | 1 | 8 | 9 | 8 | 26 | 12 mới, 14 còn |
| ui | [ui.md](ui.md) | 0 | 12 | 16 | 20 | 48 | 12 mới, 36 còn |
| **Tổng** | | **8** | **42** | **79** | **70** | **199** | |

## 2. Chặn trước tiên (blocker)

1. **Merge conflict markers đã commit ở HEAD.** Build không được ở cả 3 repo:
   - `gateway`: 9 file (ví dụ `src/packages/guards/jwt-auth.guard.ts`, `src/features/user/user.controller.ts`), tsc báo 51 lỗi TS1185. Mã: GW3-01.
   - `third`: 24 file, tsc báo 111 lỗi TS1185. Mã: TRD3-02.
   - `tutor`: 1 file `src/features/chapter/chapter.service.ts:45-51`. Mã: TUT3-02. Nhánh stash bỏ kiểm tra owner, phải giữ nhánh upstream.
   - Cần chọn đúng nhánh cho từng conflict trước khi tin bất kỳ kết quả test/runtime nào.
2. **Secret có thể bị lộ.**
   - `third/.env.compose` đang được git theo dõi, chứa JWT access/refresh secret, mật khẩu Postgres và RabbitMQ. Mã: TRD3-01 (Critical).
   - `gateway/docker.env` dùng JWT secret rất ngắn. Khi review, một agent đã grep ra vài ký tự đầu của giá trị. Mã: GW3-08 (chưa xác minh triển khai).
   - Nếu các file này đã dùng thật: xoay JWT secret và mật khẩu DB/RabbitMQ, rồi gỡ khỏi git.
3. **RabbitMQ không có xác thực RPC.** Handler RPC của tutor không có JwtAuthGuard, tin `userId` từ payload. Docker-compose publish cổng 5672 với `admin/admin` mặc định. Mã: TUT3-01 (Critical). Đây là điều kiện để nhiều lỗi IDOR bên dưới khai thác được.

## 3. Critical

| Mã | Repo | Mô tả |
|---|---|---|
| GW3-01 | gateway | Build không được do conflict markers (mục 2.1) |
| GW3-02 | gateway → user | TUTOR đọc, sửa, xoá mọi user kể cả ADMIN qua `/students/:id`. USER bỏ qua actor, không kiểm role |
| USR3-01 | user | RPC `getDetailUser` / `updateUser` / `deleteUserByAdmin` không nhận actor, không kiểm quyền. Cùng lỗi với GW3-02 |
| USR3-02 | user | `POST /auth/register` công khai tạo ngay TUTOR. Bước đầu chuỗi leo thang với USR3-01 |
| USR3-03 | user | Cổng HTTP của user (publish 4002): `/students` không có RolesGuard, mọi user đăng nhập đều xoá/sửa được học sinh bất kỳ |
| USR3-04 | user | Học sinh/phụ huynh tạo qua HTTP có mật khẩu cố định `Student@123456` / `Parent@123456`. `userCode` lộ qua `GET /students`, đăng nhập bằng user-code để chiếm tài khoản |
| TRD3-01 | third | `.env.compose` commit secret thật (mục 2.2) |
| TUT3-01 | tutor | Handler RPC không xác thực, tin `userId` từ payload, `report.*` không kiểm ADMIN (mục 2.3) |

## 4. High (theo chủ đề)

**Phân quyền / IDOR**
- GW3-02 / USR3-01 (chi tiết ở mục 3). Notification IDOR ở `third` (TRD3-02 nhóm conflict, phần IDOR đã ghi trong third.md).
- USR3-05: `GET /users` HTTP không có role guard, liệt kê toàn bộ user.
- USR3-06: OAuth gộp tài khoản theo email bất kể role, không kiểm `verified`. Pre-hijack qua đăng ký công khai.
- USR3-07: đổi mật khẩu, khoá, xoá user không thu hồi session Redis. Refresh token cũ vẫn dùng được.
- USR3-08: `parentId` / `tutorId` `onDelete: cascade`, xoá một tutor xoá luôn học sinh và phụ huynh.
- TRD3-04: RPC `redis.get/set/del` không xác thực, không whitelist. Đọc được refresh token (`session:{userId}`) và reset token.
- TRD3-05: `DELETE /upload/:key` không có RolesGuard ở nhánh HEAD. Mọi user đăng nhập xoá được object R2.
- TUT3-04: học sinh và phụ huynh trong lớp thấy email, số điện thoại của học sinh cùng lớp và phụ huynh.
- TUT3-05: `tuition.create` không kiểm `studentId` có thuộc lớp không. Trả phone/avatar của user bất kỳ theo UUID.
- TUT3-07: xoá lớp cascade xoá lịch sử học phí, không xác nhận.
- GW3-06, GW3-07: nhiều route `student` không có `@Roles`; `get-student-code` gọi RPC không tồn tại đúng kiểu.

**Lộ dữ liệu / secret**
- GW3-04: lỗi DB ở USER/tutor trả nguyên message ra client. Message là câu SQL kèm params, gồm cả hash mật khẩu.
- GW3-05: OAuth đưa accessToken và refreshToken vào query string. Không có `state` (nguy cơ login CSRF). Có fallback client id/secret giả.
- USR3-09: lỗi không phải HttpException (kể cả Drizzle) trả nguyên message.
- USR3-10: `POST /students` và `PUT /students/:id` trả nguyên password hash.
- USR3-11: `console.log(resetPasswordDto)` in mật khẩu mới và token reset ra stdout.
- USR3-12: `POST /auth/reset-password` bị JwtAuthGuard chặn, người quên mật khẩu không nhận được luồng reset.
- TUT3-06: `DATABASE_URL` có mật khẩu bị log khi khởi động (`database.module.ts:60`).

**Hạ tầng / độ tin cậy**
- GW3-03: `/health/postgres` public làm USER nạp toàn bộ bảng users mỗi lần gọi (DoS, không cần đăng nhập). PII đã được sửa.
- TRD3-06: RMQ không set `noAck: false`, mặc định là `noack=true`. Message mất khi crash.
- TRD3-07: test-scenario RPC lỗi validation.
- TRD3-08: `upload.delete` trả void, mã HTTP cuối chưa xác minh.
- TRD3-03: import trùng `resolveJwtAccessSecret` gây TS2300. Lỗi ngữ nghĩa, còn sau khi gỡ conflict.
- TUT3-03: `agents.service` không khoá tool, `permissionMode`, `cwd`. Prompt injection có thể tới tool đọc file như `.env`. Chưa xác minh SDK mặc định.
- TRD3-18 / TUT3-08: `scripts/recreate-db.ts` DROP toàn bộ bảng và enum, không có guard môi trường. DB dùng chung 4 service.

**Lệch hợp đồng và chức năng hỏng (UI ↔ gateway)**
- UI3-01: lưu Cài đặt luôn 422 vì `PUT /users` gửi field ngoài `updateSelfSchema` (strict). Round2 đánh giá sai mục này.
- UI3-02: `GET /students` chỉ ADMIN, nhưng TUTOR và PARENT đều gọi và nhận 403.
- UI3-03: thêm học sinh mặc định `parentRelationship="MALE"` và option `OTHER`, không thuộc enum gateway → 422.
- UI3-04: liệt kê và tạo bài học dùng route không tồn tại ở gateway.
- UI3-13, UI3-14: form lịch gửi `date/startTime/endTime` thay vì `startAt/endAt/sessionNumber`. Tạo bị 422, sửa bị bỏ qua.
- UI3-15: đổi trạng thái buổi học dùng PATCH, gateway chỉ có PUT → 404.
- UI3-16: socket provider đọc token một lần lúc mount, không bao giờ nối được.
- UI3-17: chat REST và socket gọi gateway không có controller chat.
- UI3-18: đăng xuất không `queryClient.clear()`, user B thấy cache của user A.
- UI3-19, UI3-20: tạo user thiếu password (422), sửa user gửi key lạ (422).

## 5. Thứ tự sửa đề xuất

1. **Ngay:** resolve conflict markers ở gateway, third, tutor (mục 2.1). Gỡ `.env.compose`/`docker.env` khỏi git, xoay secret nếu đã dùng thật (mục 2.2).
2. **Chặn leo thang:** USR3-02 (không cho register tạo TUTOR), USR3-01/GW3-02 (user enforce actor và role), TUT3-01 (RPC kiểm JWT hoặc đóng broker), USR3-03 (RolesGuard cho `/students` HTTP), TRD3-04 (whitelist Redis RPC), TRD3-05 (guard delete upload).
3. **Đóng lộ dữ liệu:** GW3-04 (không trả message DB ra client), USR3-10/11 (không trả hash, không log mật khẩu), TUT3-04/05 (kiểm thành viên lớp), TUT3-06 (không log DATABASE_URL), GW3-05 (OAuth state, token qua cookie hoặc body).
4. **Chặn thao tác phá hoại:** TRD3-18/TUT3-08 (guard môi trường cho recreate-db), TUT3-07 (xác nhận khi xoá lớp).
5. **Sửa chức năng hỏng:** UI3-01 đến UI3-20 theo thứ tự form có ảnh hưởng dữ liệu trước (lịch, học sinh, user).
6. Medium và Low: xử lý theo từng báo cáo repo.

## 6. Báo cáo chi tiết

- [gateway.md](gateway.md)
- [user.md](user.md)
- [tutor.md](tutor.md)
- [third.md](third.md)
- [ui.md](ui.md)
