# Known issues — test-monitor run (2026-10-11)

Trạng thái sau một vòng smoke (353 case đọc + auth) và regression (309 case ghi/validation):
smoke **350/353**, regression **309/309**. Các case dưới đây còn FAIL và được giữ để theo dõi.

## Smoke còn FAIL

| Case | Kết quả | Nguyên nhân | Loại |
| --- | --- | --- | --- |
| `POST /emails/test` (trước là `GET /emails`) | 500 | Resend từ chối gửi: domain `gmail.com` chưa verify. Route gửi mail thật. | Cấu hình bên ngoài |
| `GET /students/get-student-code` | 400 | Gateway gọi `user.getUserByField({})`. USER không có RPC sinh mã học sinh (chỉ có HTTP trong USER). Cần thêm pattern RPC bên USER rồi nối gateway. | Thiếu RPC |
| `GET /upload/download` | 400 | Case `valid` không có `key` hợp lệ. Cần một object thật trong R2 (hoặc case riêng cho 404). | Thiếu dữ liệu test |

## Lỗi thật chưa sửa (ngoài phạm vi lượt này)

- **`POST /curriculum` với `gradesId` không tồn tại → 500** (vi phạm FK `grade_id`, không map sang 4xx). Lỗi ở tutor-service `curriculum.repository`: cần kiểm tra grade tồn tại trước khi insert.
- **Luồng success của method ghi chưa có case.** Generator chỉ sinh case `valid` cho GET, nên create/update/delete thành công chưa được regression tự động kiểm tra.
- **`request_logs` ghi status 201 cho POST bị 422** (ví dụ `POST /classes` body sai). `test_runs` ghi đúng 422. Có vẻ interceptor ghi `HttpCode` mặc định thay vì status lỗi thật.
- **Dữ liệu seed và test**: `seed-edu-flow.ts` đã được sửa (thêm `code`, sửa route lesson, thêm schedule/tuition/notification). Scenario `GET /chapter/{id}` và `/curriculum/lessons/{id}` dùng `value` cố định (id của bản ghi đã seed), sẽ sai nếu seed lại.

## Đã sửa trong lượt này (để đối chiếu)

- Gateway: contract query/body cho class, session, schedule, notification, exercise, curriculum, attendance; tuition thiếu `userId`; upload download thiếu key (400); `admin/students/:id` và `admin/tutors/:id` dùng `user.getDetailUser`; `student` detail; `classes/:id/students|materials|watches` gửi `id`; `notification.create` gửi `senderId`; `isRead` chỉ nhận `true|false`; `LessonModule` đăng ký trước `CurriculumModule` (fix route `/curriculum/lessons` bị `/curriculum/:id` che); `TestScenarioModule` chỉ đăng ký khi `NODE_ENV !== 'production'`.
- tutor-service: `toDate` helper áp dụng cho các cột timestamp của class, session, tuition (fix lỗi `value.toISOString is not a function`).
- Scenario: expectation của `/kafka/error` và `/kafka/tutor/error` đổi thành 400 (route cố ý ném lỗi), `generate-code` đổi thành 201, một số path thêm query hợp lệ.
