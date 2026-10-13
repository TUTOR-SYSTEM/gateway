# Review vòng 2: user service

## Tổng quan

- **Phạm vi**: `/home/haidangphan/Documents/project/USER` (`src/**`, `test/**`), đối chiếu `gateway/src/features/{admin,student,user,auth}/*.controller.ts` và `gateway/src/packages/guards/jwt-auth.guard.ts`. Không sửa file nguồn. Review tĩnh, chưa chạy code.
- **Báo cáo cũ** `gateway/reviews/user-review.md` (USR-01..31): đã kiểm lại từng mục trên code hiện tại. 3 mục đã được xử lý ở gateway (USR-01 một phần, USR-06, USR-10), 28 mục còn nguyên.
- **Thay đổi kiến trúc quan trọng so với vòng 1**: gateway nay định tuyến toàn bộ `/admin/tutors|students/*` và `/students/*` sang các pattern `user.*` (`user.getDetailUser`, `user.updateUserByAdmin`, `user.deleteUserByAdmin`, `user.updateUser`, `user.createUser`, `user.getUsers`, `user.getUserByField`). Gateway gửi thêm `expectedRole` (admin) và `actorId`/`actorRole` (student), nhưng **user service không đọc các trường này ở bất cứ đâu** (grep `expectedRole|actorId|actorRole` trong `src/` và `test/` cho 0 kết quả). Toàn bộ logic của `AdminService`/`StudentService` (kiểm tra role, FK, lowercase email, ánh xạ `subjects`) không còn nằm trên đường RPC (chỉ còn trên HTTP cổng 8888). Phần lớn bug mới xuất phát từ khoảng trống này.
- **Chuỗi tấn công nghiêm trọng nhất**: `POST /auth/register` (public, không xác minh email) tạo ngay tài khoản `TUTOR` -> `TUTOR` được qua `@Roles('ADMIN','TUTOR')` của `/students/:id` -> `user.deleteUserByAdmin` không kiểm tra actor/role đích -> xoá được bất kỳ user nào kể cả ADMIN (cascade xoá cả học sinh/phụ huynh liên quan).
- Phần xác thực login/refresh trong `auth.service.ts` vẫn viết cẩn thận (dummy hash, kiểm `typ`, refresh gắn session). Lỗi tập trung ở authz tầng RPC, contract gateway/user và thu hồi session.

## Thống kê (bug mới USR2-xx)

| Severity | Số lượng |
|---|---|
| Critical | 1 |
| High | 3 |
| Medium | 7 |
| Low | 3 |
| **Tổng** | **14** |

Mục cũ còn tồn tại: 28/31 (xem bảng "Đối chiếu báo cáo cũ").

## (b) Bug mới

| ID | Severity | File:line | Mô tả | Kịch bản lỗi | Đề xuất sửa |
|---|---|---|---|---|---|
| USR2-01 | Critical | `src/features/user/user.rpc.controller.ts:26-29,41-46,58-61`; gateway `student/student.controller.ts:226-231,278-283,293-298` | Handler `user.getDetailUser`, `user.updateUser`, `user.deleteUserByAdmin` chỉ destructure `{userId}`/`{id}`; `actorId`/`actorRole` gateway gửi bị bỏ. Service không kiểm tra role của user đích (`student.repository.ts` có `eq(role,'STUDENT')` nhưng chỉ chạy trên HTTP, không nằm trên đường RPC) và không kiểm tra quyền sở hữu (`tutorId`). | TUTOR gọi `DELETE /students/<id của ADMIN hoặc tutor khác>` -> `deleteUserByAdminService` (`user.service.ts:275-289`) xoá thẳng; `parent_id`/`tutor_id` là `ON DELETE CASCADE` (`schema.ts:43-44`) nên xoá cả học sinh của tutor đó. `GET /students/<id bất kỳ>` trả toàn bộ hồ sơ (kể cả `googleId`, `facebookId`, `userCode`) của mọi user. `PUT /students/:id` sửa được hồ sơ của mọi user, `role` không được truyền nên bước chặn `STUDENT_CANNOT_UPDATE_NAME` (`user.service.ts:250`) bị bỏ qua. | Rpc controller nhận `actorId`/`actorRole`/`expectedRole`; service nạp user đích, bắt buộc `target.role === 'STUDENT'`, và với `actorRole === 'TUTOR'` bắt buộc `target.tutorId === actorId`; ADMIN mới được thao tác không điều kiện. Từ chối nếu thiếu actor (fail closed). |
| USR2-02 | High | `src/features/user/user.rpc.controller.ts:31-39,41-46`; `user.service.ts:133-149`; gateway `student/student.controller.ts:55,123,278` | Hợp đồng sai giữa gateway và user cho 3 route `/students`: `POST /students` gửi `{studentName, parentName, studentPhone, ...,userId}` vào `user.createUser`, trong khi `createUserService` cần `email/firstName/lastName/password`; `GET /students/get-student-code` gửi `{}` vào `user.getUserByField` (không có `field`); `PUT /students/:id` gửi `studentName/studentPhone/birthday/parent*` vào `user.updateUser`. | (a) Tạo: `email` có thể `undefined` -> `eq(users.email, undefined)` (`user.repository.ts:27`) lỗi postgres.js UNDEFINED_VALUE, trả 500; nếu có email nhưng thiếu `password` -> `hashData(undefined)` ném 400 "Failed to hash data: ..." (`hashingData.helper.ts:10`). Tạo học sinh qua gateway không bao giờ thành công. (b) `get-student-code` luôn 400 `UNSUPPORTED_FIELD`. (c) Cập nhật: Drizzle bỏ qua key lạ (`studentName`, `studentPhone`, `birthday`, `parent*`) nên trả 200 nhưng không ghi gì, chỉ `school/address/district/province/gender/avatar` được ghi. Parent không bao giờ được tạo/cập nhật. | Thêm RPC `student.*` riêng gọi lại `StudentService` (create/update/findById/delete/generateCode) hoặc map payload ở gateway đúng `CreateUserDto`; kiểm tra contract bằng test chung. |
| USR2-03 | High | `src/features/user/user.repository.ts:49-69`; `user.service.ts:68-99`; `user.rpc.controller.ts:21-24`; gateway `student/student.controller.ts:126,156` | `GET /students` (không `@Roles`, mọi user đã đăng nhập gọi được) chuyển nguyên query sang `user.getUsers`. `buildUserListConditions` chỉ lọc `search/role/isActive`, bỏ `tutorId`/`gender`, và `role` không được ép về STUDENT. | Một STUDENT/PARENT bất kỳ gọi `GET /students?limit=100` nhận `id, email, name, role, status` của toàn bộ user (kể cả ADMIN, TUTOR); duyệt hết các trang để thu thập email. Bộ lọc `tutorId` bị bỏ qua nên tutor thấy học sinh của tutor khác. | Gateway gắn `@Roles('ADMIN','TUTOR')`; user service ép `role: 'STUDENT'` cho route student và lọc `tutorId = actorId` với TUTOR; hỗ trợ `gender/tutorId` trong repo. |
| USR2-04 | High | `src/features/auth/auth.service.ts:164-171`; gateway `auth/auth.controller.ts:52,79` | `auth.register` (public) tạo ngay user `role: 'TUTOR'`, không xác minh email, không duyệt. TUTOR được các route `@Roles('ADMIN','TUTOR')` của `/students`. | Bất kỳ ai tự đăng ký có quyền TUTOR và khai thác USR2-01/USR2-03 (xoá/đọc/sửa user bất kỳ) ngay lập tức. | Tạo role mặc định thấp (STUDENT) hoặc trạng thái chờ duyệt (`isActive=false` đến khi admin kích hoạt); xác minh email. |
| USR2-05 | Medium | `src/features/user/user.rpc.controller.ts:26-29,48-51,58-61`; gateway `admin/admin.controller.ts:152,165,174,220,236,245` | `expectedRole: 'TUTOR'|'STUDENT'` gateway gửi cho `/admin/tutors/:id` và `/admin/students/:id` bị bỏ qua hoàn toàn. | `GET/PUT/DELETE /admin/tutors/<id của ADMIN hoặc STUDENT>` đọc/sửa/xoá user sai loại; `DELETE /admin/students/<id admin>` xoá admin. Chỉ ADMIN gọi được nên mức Medium, nhưng mất ràng buộc "tutor chỉ thao tác tutor" mà `AdminService.getManagedUser` từng bảo đảm (`admin.service.ts:135-144`). | Kiểm tra `target.role === expectedRole` trong service, trả 404 nếu lệch. |
| USR2-06 | Medium | `src/features/user/user.service.ts:229`; `user.repository.ts:108-115`; `src/packages/entities/user/user.schema.ts:167` | `dateOfBirth` được validate bằng `z.coerce.date()` ở gateway thành `Date`, nhưng qua RMQ JSON thành chuỗi ISO. RPC handler không có pipe nào chuyển lại. Cột `timestamp` mode date của Drizzle gọi `value.toISOString()` (`node_modules/drizzle-orm/pg-core/columns/timestamp.js:34`) trên chuỗi. | `PUT /users` (self), `PUT /users/:id`, `PUT /admin/students/:id` có `dateOfBirth` -> TypeError `value.toISOString is not a function` -> 500 (message thô trả về qua `rpc-exception.filter.ts:49`). Không thể cập nhật ngày sinh qua gateway. | Trong service/rpc controller: `if (typeof data.dateOfBirth === 'string') data.dateOfBirth = new Date(data.dateOfBirth)`; hoặc validate lại payload bằng Zod trong RPC. |
| USR2-07 | Medium | `src/features/user/user.service.ts:23-29,247`; `src/packages/entities/user/user.schema.ts:184-193`; `src/features/user/user.controller.ts:140-149` | `SELF_UPDATE_RESTRICTED_FIELDS` thiếu `googleId`, `facebookId`. `PUT /users` của HTTP cổng 8888 dùng `updateUserSchema` (cho phép hai trường này) rồi gọi `updateOwnProfileService`. Gateway đã cắt chúng bằng `updateSelfSchema`, nhưng service không tự bảo vệ (RPC không validate). | Người dùng gọi trực tiếp cổng HTTP của user service (hoặc client RMQ khác) ghi `googleId`/`facebookId` tuỳ ý, giả liên kết OAuth với tài khoản khác. | Thêm `googleId`, `facebookId` (và `gradesId`, `email` nếu cần xác minh) vào danh sách bị chặn. |
| USR2-08 | Medium | `src/features/user/user.service.ts:207-231` | `updateUserService` không kiểm tra FK/role cho `parentId`, `tutorId`, `gradesId` (đường RPC không qua `AdminService.updateStudent` đang có kiểm tra ở `admin.service.ts:75-82`). | `PUT /admin/students/:id` với `parentId` không tồn tại -> lỗi FK 23503 -> 500 (message Drizzle chứa SQL, xem USR-03). `parentId = chính id` hoặc trỏ tới user không phải PARENT được ghi thẳng; `gradesId` là mảng uuid không có FK nên nhận bất kỳ giá trị. | Gọi `existsWithRole(parentId,'PARENT')`, `existsWithRole(tutorId,'TUTOR')`, `validateGradeIds` trước khi ghi; cấm `parentId === id`. |
| USR2-09 | Medium | `src/features/user/user.service.ts:258-289` | Xoá/khoá user không có guard: ADMIN có thể xoá/khoá chính mình hoặc admin cuối cùng. Không dọn session. Xoá kéo theo cascade (USR-08) và có thể lỗi FK 23503 với bảng của service khác (tutor-service) trả 500. | Admin duy nhất bấm xoá/khoá nhầm chính tài khoản mình: hệ thống mất admin, không còn ai quản trị. | Từ chối khi `id === actorId` hoặc khi đích là ADMIN cuối; truyền `actorId` cho các pattern này. |
| USR2-10 | Medium | `src/main.ts:92-93`; `src/features/student/student.controller.ts` (toàn bộ, không `@Roles`); `src/features/admin/*`; `src/features/student/student.service.ts:103,113,308` | User service vẫn `app.listen(PORT)` (mặc định 8888) và phục vụ song song HTTP controller (auth/user/admin/student) với logic lệch so với đường RPC. Gateway không dùng `StudentService`/`AdminService` nữa nhưng code (kèm mật khẩu mặc định cố định, USR-02/04/17/21) vẫn chạy trên cổng HTTP. | Nếu cổng 8888 lộ ra ngoài (Railway public domain, docker-compose map port): người dùng đã đăng nhập (kể cả STUDENT) gọi `/students` tạo/sửa/xoá học sinh bất kỳ, nhận bcrypt hash trong response, và đăng nhập bằng `Student@123456`. Hai bản logic trôi lệch nhau. | Tắt HTTP listener ở production (chỉ microservice RMQ) hoặc xoá controller/service HTTP thừa; nếu giữ thì thêm `RolesGuard` và dùng chung service. |
| USR2-11 | Medium | `src/features/user/user.service.ts:270,287`; `src/features/auth/auth.service.ts:72-82,298-311`; gateway `packages/guards/jwt-auth.guard.ts:118-146` | Gateway guard hiện chỉ kiểm tra `session:{userId}` trong Redis (fail open), không còn xác nhận user tồn tại hoặc `isActive` qua RPC (CLAUDE.md của gateway còn ghi sai). Khoá/xoá user không xoá session. | ADMIN khoá hoặc xoá một tutor: access token cũ vẫn dùng được đến 3h (và cache 5s), session Redis còn 7 ngày; không có `auth.logout` nào để thu hồi (`logoutService` ở `auth.service.ts:340-353` không có pattern gọi). Mở rộng USR-07. | `updateStatusUser`/`deleteUserByAdmin`/đổi mật khẩu gọi `redis.del session:{id}`; gateway guard kiểm `isActive` qua cache ngắn hoặc thêm `tokenVersion` vào JWT. |
| USR2-12 | Low | `src/features/user/user.service.ts:37-39,155-162`; `src/features/auth/auth.service.ts:202-212` | `userCode` chỉ sinh cho TUTOR (hex, 16^6). STUDENT/PARENT tạo qua `user.createUser` (đường duy nhất gateway dùng) không có `userCode` nên `POST /auth/login/user-code` (chỉ nhận PARENT/STUDENT, `auth.schema.ts:77`) vô dụng với họ. Vòng lặp 5 lần sinh mã mới ở lần cuối mà không kiểm tra lại. So khớp `userCode` phân biệt hoa thường. | Học sinh do admin tạo không có mã đăng nhập; nhập mã chữ thường bị từ chối. | Sinh mã cho STUDENT/PARENT bằng `crypto.randomInt`, unique index, `toUpperCase()` khi so khớp. |
| USR2-13 | Low | `src/packages/helpers/hashingData.helper.ts:4-6`; `src/packages/entities/auth/auth.schema.ts:36` | bcrypt chỉ dùng 72 byte đầu; schema giới hạn 25 ký tự (không phải byte). | Mật khẩu 25 ký tự có dấu/emoji (>72 byte) bị cắt âm thầm, hai mật khẩu khác đuôi vẫn khớp. | Kiểm `Buffer.byteLength(password) <= 72` trong schema. |
| USR2-14 | Low | `test/**` (không có test cho `expectedRole`, `actorId`, `actorRole`); `coverage-report.txt` | Test hiện chỉ xác nhận RPC controller gọi đúng service (`test/features/user/user.rpc.controller.spec.ts`), không có test hợp đồng gateway-user, không test authz theo actor, không test `dateOfBirth` chuỗi, không test `app.controller`. `coverage-report.txt` liệt kê test của feature đã bị xoá (category, transaction, redis, email). | Các lỗi USR2-01/02/05/06 lọt qua vì không test nào chạm tới. | Thêm test hợp đồng cho từng pattern với payload thực của gateway; xoá báo cáo coverage cũ. |

## (a) Đối chiếu báo cáo cũ (đã kiểm lại với code hiện tại)

| ID cũ | Trạng thái | Vị trí hiện tại | Ghi chú |
|---|---|---|---|
| USR-01 (Critical) | Một phần | `user.rpc.controller.ts:36-61` | Gateway đã gắn `@Roles('ADMIN')` cho `/users/*` quản trị (`gateway/.../user.controller.ts:57,96,117,160,182,199`). RPC vẫn không tự kiểm tra gì; trên đường `/students` và `/admin` vẫn bị khai thác (USR2-01, USR2-05). `createUserService` vẫn nhận `role` ADMIN từ payload (`user.service.ts:153`). |
| USR-02 (Critical) | Còn (chỉ HTTP 8888) | `student.service.ts:103,113,308`; `auth.service.ts:202-212`; `generate.helper.ts:6` | Mật khẩu mặc định `Student@123456`/`Parent@123456`; `generateCode` dùng `Math.random`. Gateway không còn gọi `StudentService`, nhưng cổng HTTP vẫn phục vụ (USR2-10). |
| USR-03 (High) | Còn | `rpc-exception.filter.ts:49`; `main.ts:63` | Lỗi không phải `HttpException` trả nguyên `exception.message`; `ErrorInterceptor` chỉ đăng ký cho HTTP. USR2-06/08 tạo thêm đường dẫn tới lỗi này. |
| USR-04 (High) | Còn (HTTP) | `student.service.ts:149,341`; `student.repository.ts:33,53,77` | Trả nguyên row có `password`. |
| USR-05 (High) | Còn (HTTP) | `auth.controller.ts:257` | `console.log(resetPasswordDto)` in `jti` và mật khẩu. |
| USR-06 (High) | Một phần | `auth.controller.ts:222-223` (HTTP) | Gateway đã có `@Public()` (`gateway/.../auth.controller.ts:223`); HTTP của user service vẫn thiếu. |
| USR-07 (High) | Còn, nặng hơn | `auth.service.ts:251-291`; `user.service.ts:189-204,258-289,292-305` | Xem USR2-11: gateway không còn kiểm tra `isActive`; không có route logout. |
| USR-08 (High) | Còn | `schema.ts:43-44` | `onDelete: 'cascade'` cho `parentId`, `tutorId`; USR2-01 biến thành vũ khí. |
| USR-09 (High) | Còn | `auth.service.ts:116-140`; `google.strategy.ts:28-40`; `facebook.strategy.ts:30-43` | Gộp tài khoản theo email (kể cả ADMIN) không kiểm xác minh, không lưu `googleId`/`facebookId`. |
| USR-10 (Medium) | Đã sửa ở gateway | `gateway/.../user.controller.ts:152-156` | `userId`/`role` đặt sau spread; `updateSelfSchema` bỏ `role`. Trong service, `'role'` trong danh sách hạn chế giờ có ý nghĩa vì `role` bị destructure khỏi `data`. |
| USR-11 (Medium) | Còn | `auth.service.ts:72-82,106,298-311` | `redis.set` không await, 1 session/user, fail-open khi RMQ lỗi. |
| USR-12 (Medium) | Còn | `auth.service.ts:254-268` | get -> update -> `emit redis.del` không atomic. |
| USR-13 (Medium) | Còn | `trace-context.interceptor.ts:22-30` | Thiếu `jti`, `currentPassword`, `resetToken` trong `SENSITIVE_KEYS`; payload `auth.resetPassword`/`user.changePassword` đi vào `request_logs`. |
| USR-14 (Medium) | Còn | `auth.service.ts:146-149,192-195`; `user.service.ts:137-138,220-227` | Email không chuẩn hoá; lệch với `admin.service.ts:96` (HTTP). Nay `/admin/*` đi qua `createUserService` nên email admin tạo cũng không lowercase. |
| USR-15 (Medium) | Còn | `auth.service.ts:146-171`; `user.service.ts:137-168` | Check-then-insert, không bắt 23505. |
| USR-16 (Medium) | Còn | `schema.ts:31`; `user.service.ts:155-162`; `auth.service.ts:208` | `userCode` không unique, hết lần thử vẫn dùng mã trùng. `updateUserService` không kiểm tra trùng `userCode`. |
| USR-17 (Medium) | Còn (HTTP) | `student.service.ts:117,134,295,309-314` | `email: ''` unique, 2 insert không transaction. |
| USR-18 (Medium) | Còn, nặng hơn | `user.service.ts:133-177` | Nay là đường duy nhất của `/admin/tutors|students` POST: `phone, gender, dateOfBirth, school, subjects, description, isActive` bị bỏ (admin không tạo được tài khoản `isActive:false`). |
| USR-19 (Medium) | Còn | `user.schema.ts:61,235,273`; `auth.schema.ts:35-36` | Chính sách mật khẩu không nhất quán (6-25, 6-20, 8-14). |
| USR-20 (Medium) | Còn | `user.service.ts:49-65`; `auth.schema.ts:54`; `schema.ts:22` | `username` varchar(50), sinh từ tên có thể >50 hoặc rỗng (OAuth tên dài). |
| USR-21 (Medium) | Còn (HTTP) | `student.controller.ts` | Không `@Roles`, không kiểm tra sở hữu. |
| USR-22 (Medium) | Còn | `auth.service.ts:127-139` | Không lưu `googleId/facebookId/avatar` cho user OAuth mới. |
| USR-23 (Medium) | Còn | `jwt-sign.config.ts:17-21`; `jwt-user.strategy.ts:10`; `app.module.ts:26-29` | Secret mặc định `dev-insecure-jwt-secret`; refresh secret mặc định bằng access secret. |
| USR-24 (Medium) | Còn | `facebook.strategy.ts:18-19` | `!` không fallback. Cần xác minh khi thiếu env. |
| USR-25 (Low) | Còn | `auth.service.ts:91` | Sai thông tin đăng nhập trả 400. |
| USR-26 (Low) | Còn | `auth.service.ts:233-246` | Nhánh email tồn tại `await` 2 lệnh RMQ nên lệch thời gian; gửi cho cả tài khoản inactive. |
| USR-27 (Low) | Còn | `user.service.ts:106` | `getDetailUserService` trả `null` (gateway trả 200, `/admin/tutors/:id` không tồn tại ra 200 rỗng). |
| USR-28 (Low) | Còn | `user.service.ts:123`; `user.repository.ts:27` | `user.getUserByField` với `field:'id'` không phải UUID -> 22P02 -> 500. |
| USR-29 (Low) | Còn | `user.service.ts:270` | Toggle `isActive`, không idempotent, bị `RmqProducer` retry lật lại. |
| USR-30 (Low) | Còn | `main.ts:36-47`; `rmq.producer.ts:127-183` | Không `noAck:false`/DLQ; `send` retry cả lỗi nghiệp vụ và lệnh không idempotent (`user.createUser`, `email.sendForgotPasswordMail`). |
| USR-31 (Low) | Còn | `app.controller.ts:29-103,112,138-150` | `health.postgres` `findMany()` cả bảng; pattern `kafka.*` giả vẫn còn. |

## Chi tiết

### USR2-01 Thiếu kiểm tra actor/sở hữu trên đường /students

`gateway/src/features/student/student.controller.ts:226-231` gửi `{ userId: _id, actorId, actorRole }` cho `user.getDetailUser`, `:278-283` gửi `{...dto, userId: _id, actorId, actorRole}` cho `user.updateUser`, `:293-298` gửi `{ id, actorId, actorRole }` cho `user.deleteUserByAdmin`. Bên nhận:

```ts
getDetailUser(@Payload() { userId }: { userId: string })            // user.rpc.controller.ts:27
updateUser(@Payload() { userId, role, ...data }: ...)               // :43  (role = undefined vì gateway gửi actorRole)
deleteUserByAdmin(@Payload() { id }: { id: string })                // :59
```

`deleteUserByAdminService` (`user.service.ts:275-289`) chỉ kiểm tra UUID và sự tồn tại rồi `userRepo.delete(id)` (`user.repository.ts:126-128`). Các hạn chế "chỉ student", "chỉ của tutor đó" từng nằm ở `StudentRepository` (`eq(users.role,'STUDENT')`, `student.repository.ts:61,76,93`) không còn được gọi. Vì `actorRole` không map thành `role`, `updateOwnProfileService` nhận `role` rỗng nên bỏ qua kiểm tra riêng của STUDENT. Kết hợp USR2-04 (đăng ký công khai thành TUTOR) đây là xoá/đọc/sửa user bất kỳ không cần đặc quyền.

### USR2-02 Hợp đồng /students không khớp user.*

`createStudentSchema` (gateway) có `studentName`, `studentPhone`, `parentName`, `parentEmail`..., không có `firstName/lastName/password`. `createUserService` (`user.service.ts:134-140`) dùng `email`, `firstName`, `lastName`, `password`. Với body `{studentName:'A B'}`: `getUserByField({field:'email', value: undefined})` -> `eq(users.email, undefined)`. Lỗi sinh từ driver postgres.js, trả 500. Route `get-student-code` gửi `{}` nên `field` là `undefined` và `searchableFields.includes(undefined)` false -> 400. `updateStudentSchema` là `z.object` không strict nên `studentName`... được giữ lại, đến `userRepo.update(id, data)`; Drizzle `mapUpdateSet` bỏ key không thuộc bảng nên không có lỗi nhưng cũng không có ghi.

### USR2-06 dateOfBirth

Chuỗi sự kiện: gateway `z.coerce.date()` -> `Date` -> JSON.stringify -> chuỗi ISO trong message RMQ -> `updateUserService` -> `userRepo.update` -> `PgTimestamp.mapToDriverValue(value) = value.toISOString()` (xác nhận trong `timestamp.js:34`, Drizzle 0.45.2). Chuỗi không có `toISOString`.

### USR2-11 Hiệu lực khoá/xoá user

Gateway guard (`jwt-auth.guard.ts:128-146`) chỉ `redis.get session:{id}`: có giá trị là cho qua, lỗi hạ tầng cũng cho qua. `updateStatusUserService` và `deleteUserByAdminService` không đụng Redis, nên khoá/xoá chỉ có hiệu lực khi refresh (`issueLoginResponse` kiểm `isActive`, `auth.service.ts:97-99`).

## Cần xác minh

1. **Cổng HTTP 8888 có public không?** (Dockerfile/docker-compose/Railway). Quyết định mức độ thực tế của USR2-10, USR2-07, USR-02, USR-04, USR-21. Chưa đọc được `Dockerfile`/`docker-compose.yml` trong lượt này.
2. **`subjects: string[]`** của `/admin/tutors/:id` PUT (`updateManagedUserSchema`): cột `subjects` là `varchar(255)` (`schema.ts:37`), `updateUserService` ghi mảng nguyên văn (không `joinSubjects` như `admin.service.ts:169-177`). Nhiều khả năng lỗi kiểu dữ liệu (500, SQL trong message) hoặc ghi sai định dạng; chưa chạy để xác nhận hành vi postgres.js với mảng vào `varchar`.
3. **APP_GUARD `JwtAuthGuard` có áp dụng cho handler RMQ không?** Suy luận từ việc hệ thống hoạt động là không (microservice dùng ApplicationConfig riêng, `app.connectMicroservice` mặc định không `inheritAppConfig`), chưa chạy thử.
4. **Rate limit đăng nhập/đổi mật khẩu/reset**: không thấy ở user service; chưa kiểm gateway có throttle (`login`, `login/user-code`, `change-password`, `forgot-password`).
5. **`health.postgres` có được gateway expose không**: `fetchData:true` trả mẫu 5 user (email). Grep gateway chỉ thấy `kafka.ping`/`kafka.send`, không thấy `health.postgres`.
6. **Postgres thực tế đã có unique index cho `userCode`/`lower(email)` chưa** (migration nằm ở gateway `drizzle/`, schema mirror không khai báo).
