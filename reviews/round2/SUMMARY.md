# Report tổng kết vòng 2: bug còn tồn tại

- **Ngày review:** 2026-10-13 (sau khi sửa 25/29 bug gateway ở vòng 1, chưa commit)
- **Phạm vi:** 5 source `gateway`, `USER`, `tutor-service`, `THIRD_SERVICE`, `TUTOR-UI`
- **Cách review:** 5 sub agent review song song bằng đọc code tĩnh, không sửa file nguồn. Mỗi agent đối chiếu với report vòng 1, tách bug cũ còn tồn tại và bug mới. Số liệu dưới đây lấy nguyên từ báo cáo của từng agent, chưa được kiểm chứng lại độc lập.

| Source | Report | Bug mới | Bug cũ còn tồn tại |
|---|---|---|---|
| gateway | [gateway-review.md](gateway-review.md) | 28 (1 Critical, 6 High, 10 Medium, 11 Low) | một số mục sửa chưa trọn, xem mục 3 |
| user | [user-review.md](user-review.md) | 14 (1 Critical, 3 High, 7 Medium, 3 Low) | 28/31 |
| tutor | [tutor-review.md](tutor-review.md) | 20 | 30 (tổng 50: 3 Critical, 7 High, 22 Medium, 18 Low) |
| third | [third-review.md](third-review.md) | 13 (1 Critical, 3 High, 3 Medium, 6 Low) | 27/28 |
| ui | [ui-review.md](ui-review.md) | 10 | 25 (tổng 35: 0 Critical, 8 High, 14 Medium, 13 Low) |

Lưu ý: gateway tính 28 mục là bug phát hiện ở vòng 2 (ID GW2-xx), không gồm 29 mục vòng 1. Cách đếm giữa các report không hoàn toàn đồng nhất (tutor và ui báo tổng gồm cả cũ lẫn mới), nên không cộng gộp thành một con số.

## 1. Nguyên nhân gốc chung

**Gateway đã chặn đúng, nhưng service phía sau chưa enforce.** Các bản sửa GW-09, GW-10, GW-11, GW-12 chỉ có tác dụng ở lớp gateway:

- `USER` bỏ qua hoàn toàn `expectedRole`, `actorId`, `actorRole` (grep trong `src/` và `test/` ra 0 kết quả).
- `THIRD_SERVICE` bỏ qua `userId` ở `notification.getById|markAsRead|delete`.
- `tutor-service` bỏ qua `userId` ở chapter và lesson.

Vì vậy IDOR và leo thang đặc quyền vẫn còn nguyên về mặt hệ thống.

## 2. Critical

| # | Mô tả | Mã | Ghi chú |
|---|---|---|---|
| 1 | `GET /health/redis` công khai, gửi `fetchData:true`, THIRD trả giá trị 10 key Redis gồm `session:<id>` (refresh token thô) và `reset-password:<jti>`. Chưa đăng nhập vẫn chiếm được tài khoản. `/health/postgres` cũng lộ 5 user mẫu. | GW2-01, GW2-02, TRD2-01 | Lỗ hổng mới, sửa ở gateway rất nhanh: bỏ `@Public()` hoặc không gửi `fetchData` |
| 2 | TUTOR xoá, đọc, sửa được mọi user kể cả ADMIN qua `/students/:id`, vì `user.getDetailUser`, `user.updateUser`, `user.deleteUserByAdmin` không kiểm actor. Xoá còn cascade qua `parent_id`/`tutor_id`. | USR2-01, GW2-03 | Cần sửa ở service `user` |
| 3 | `auth.register` công khai tạo TUTOR ngay, nên ai cũng khai thác được mục 2. | USR2-04 | Cần sửa ở service `user` |
| 4 | Trường ngày đến qua RPC là chuỗi ISO nhưng đi thẳng vào cột timestamp drizzle (`toISOString is not a function`). `POST /classes`, session, ngày học phí nhiều khả năng trả 500. Agent đã chạy thử xác nhận lỗi. | TUT2-31 | Cần sửa ở `tutor-service` |
| 5 | Curriculum update/delete không kiểm chủ sở hữu, lesson update đổi được `curriculumId`. Gateway đã gửi `userId` nhưng service bỏ qua. | TUT2-01, GW2-08 | Cần sửa ở `tutor-service` |

## 3. High, nhóm theo chủ đề

### 3.1 Payload lệch hợp đồng giữa gateway và service (hỏng cả nhóm endpoint)
- Upload/download: gateway gửi base64, THIRD đọc `{type:'Buffer',data}` và trả `content` thay vì `buffer`. Cả hai chiều nhiều khả năng lỗi 500 (TRD2-02, GW2-05).
- Tuition: gateway bọc `{userId,...}`, tutor-service nhận id/query thô. `getAll` cho offset NaN, `getById`/`getSummary` trả 400 (TUT2-32/33, GW2-06).
- `POST`/`PUT /students` lệch hợp đồng với `user`: create luôn lỗi, update trả 200 nhưng không ghi (USR2-02, GW2-09).
- 9 pattern `testscenario.*` gateway gửi nhưng THIRD không có handler (TRD2-03, GW2-18).
- `dateOfBirth` thành chuỗi qua RMQ, drizzle gọi `.toISOString()` nên mọi update có ngày sinh trả 500 (USR2-06).

### 3.2 Phân quyền và lộ dữ liệu
- `GET /students` và `user.getUsers` không giới hạn role. Học sinh nào cũng liệt kê được email và role của mọi user (USR2-03, GW2-07).
- Class `getById`, students, materials không kiểm thành viên, lộ thông tin cá nhân học sinh và phụ huynh (TUT2-34).
- Tuition đọc không kiểm quyền theo user (TUT2-33).
- Notification IDOR vẫn còn ở THIRD (TRD2-xx, GW2-04).
- Còn tồn tại từ vòng 1: `POST /classes` không kiểm role và nhận `tutorId` tuỳ ý, chat WebSocket không kiểm thành viên, học sinh tự chấm bài tập bằng cách đặt `tutorId` là mình (TUT2-02/04/05).
- Allowlist prefix `cache:`, `public:`, `stats:` ở `GET /redis` không có service nào ghi key đó, trong khi namespace thật là `session:` và `reset-password:`. THIRD cũng không kiểm prefix ở phía nó (xem [third-review.md](third-review.md)).

### 3.3 Hạ tầng
- `redact()` trong `trace-context.interceptor.ts` duyệt Buffer từng byte, tải file 10MB có thể cạn bộ nhớ và chặn event loop (TRD2-04).
- THIRD vẫn không có `noAck:false` và DLQ.
- Guard `redis.get` có thể treo khoảng 30 giây khi THIRD chậm (GW2-10).

## 4. Bug do thay đổi gateway hôm nay làm lộ ra (UI)

| Mã | Mô tả |
|---|---|
| UI2-07 (High) | Dialog tạo user không gửi `password`, gateway giờ bắt buộc 8-20 ký tự, nên ADMIN tạo user luôn bị 422. |
| UI2-08 (High) | Dialog sửa user gửi `id` trong body, `updateUserSchema` là strict nên sửa user luôn bị 422. |
| UI2-20 | Ba màn STUDENT/PARENT/TUTOR gọi `/users/get-by-field`, route giờ ADMIN-only nên bị 403. |
| UI2-21 | Trang `/curriculum` vẫn hiện nút ghi cho PARENT. |
| UI2-19, UI2-31 | Hint "8-14 ký tự" ở dialog thêm gia sư sai (đã là 8-20). Form đổi mật khẩu còn ép độ phức tạp cho mật khẩu hiện tại. |

Các lệch cũ vẫn còn: form lịch gửi `date/startTime/endTime` thay vì `startAt/endAt/sessionNumber`, trang session dùng PATCH trong khi gateway chỉ có PUT, socket provider đọc token một lần nên không bao giờ nối được, đăng xuất không `queryClient.clear()`.

Upload cần bearer không làm UI vỡ vì mọi upload/download đều qua axios có interceptor.

## 5. Bản sửa vòng 1 chưa trọn vẹn (gateway)
- **GW-03:** upload đã bỏ `@Public()`, nhưng payload lệch (mục 3.1) khiến cả luồng vẫn hỏng.
- **GW-16:** không có rate limit, `@Throttle` là decorator chết vì `@nestjs/throttler` không phải dependency.
- **GW-19:** OAuth không có `state`, token vẫn nằm trên query string.
- **GW-26:** chỉ khoá `kafka/*`; `health/*` vẫn công khai (xem Critical mục 1).
- **GW-27:** chưa làm, cần RPC mới ở `user`.

## 6. Khác
- `USER` vẫn có HTTP listener riêng ở cổng 8888 với route student không có guard. Chưa xác minh được cổng này có public không, vì agent không đọc được `Dockerfile`/`docker-compose.yml` (USR2-10).
- Gateway không còn kiểm `isActive`, deactivate/delete không xoá session Redis (USR2-11).
- `googleId` và `facebookId` chưa nằm trong danh sách cấm self-update ở `user.service.ts` (USR2-07).
- `DATABASE_URL` kèm mật khẩu bị log ở `USER`/`THIRD`/`tutor-service` (`database.module.ts`).
- `tutor-service` không có thư mục `test/`, `test:e2e` hỏng.
- `getChatableUsers` sinh SQL `IN ()` khi tutor chưa có học sinh.

## 7. Thứ tự sửa đề xuất

**Ngay (nhỏ, chặn rò rỉ):**
1. Gateway: bỏ `@Public()` của `GET /health/redis` và `/health/postgres`, bỏ `fetchData` (GW2-01/02).
2. `user`: không cho `auth.register` công khai tạo TUTOR (USR2-04).
3. Ngừng log `DATABASE_URL` có mật khẩu ở cả 3 service.

**Tiếp theo (đóng IDOR thật sự):**
4. `user` enforce `expectedRole`, `actorId`, `actorRole`, và `getUsers` giới hạn theo role.
5. `tutor-service` dùng `userId` cho chapter/lesson/curriculum, kiểm thành viên cho class, tuition, chat.
6. `THIRD` kiểm `userId` cho notification và prefix cho `redis.get`.

**Sau đó (sửa chức năng hỏng):**
7. Thống nhất payload gateway với service cho upload, tuition, students, testscenario.
8. Chuyển ngày sang `Date` trước khi vào drizzle (TUT2-31, USR2-06).
9. Sửa UI: dialog tạo/sửa user, form lịch, socket provider, logout cache.
10. Quyết định lại danh sách prefix Redis cho `GET /redis` theo namespace thật.
