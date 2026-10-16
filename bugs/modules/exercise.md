# Bug review — module `exercise`

Ngày: 2026-10-16
Phạm vi: `src/features/exercise/` + entity `src/packages/entities/exercise/` + `rmq.producer.ts`, `rmq.constants.ts` liên quan.
Không build/test, chỉ đọc tĩnh.

| Mức | Số lượng |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 5 |
| Low | 5 |

## Bug

| ID | Mức | File:dòng | Vấn đề | Kịch bản lỗi | Hướng sửa |
|---|---|---|---|---|---|
| EXE-01 | Medium | `src/features/exercise/exercise.controller.ts:61` | `create` forward `tutorId`/`studentId` từ body, không ràng buộc với `_user.id` khi role là TUTOR. Gateway chỉ gửi `{ userId, data }`. | Tutor A tạo exercise với `tutorId` = tutor B. Chỉ đúng nếu tutor-service kiểm tra `userId === tutorId`. Chưa xác minh bên `tutor-service`. | Ép `tutorId = user.id` ở gateway khi không phải ADMIN, hoặc xác nhận check ownership ở `exercise.create` của tutor-service. |
| EXE-02 | Medium | `src/features/exercise/exercise.controller.ts:82` | `getAll` forward nguyên `studentId`/`tutorId`/`classId` từ query. Route không có `@Roles`, nên student có thể truyền ID của người khác. | Student gọi `GET /exercises?studentId=<student khác>`. Chỉ an toàn nếu `exercise.getAll` lọc theo role. Chưa xác minh bên `tutor-service`. | Lọc theo role ở tutor-service, hoặc ở gateway khi role là STUDENT thì ép `studentId = user.id`. |
| EXE-03 | Medium | `src/packages/entities/exercise/exercise.schema.ts:11-31` | `createExerciseSchema.status` chấp nhận `GRADED`/`RESUBMIT`, và schema không có `score`/`comment`/`gradedAt`. Điều này trái với comment ở `submitExerciseSchema` rằng grading chỉ đi qua endpoint grade. | Tutor tạo exercise với `status: 'GRADED'` không có điểm, tạo ra bản ghi GRADED với `score` null. Phụ thuộc tutor-service có lưu nguyên `status` không. | Bỏ `status` khỏi `createExerciseSchema` (luôn mặc định SUBMITTED), hoặc chỉ cho phép `SUBMITTED`. |
| EXE-04 | Medium | `src/packages/entities/exercise/exercise.schema.ts:42-46` | `gradeExerciseSchema.score` dùng `z.coerce.number()`. `Number(null) === 0` và `Number('') === 0`, nên `{"score": null}` hoặc `{"score": ""}` qua validation thành 0 và ghi đè điểm. | Tutor gửi `score: null` để xóa điểm, hệ thống ghi 0 và vẫn chuyển trạng thái GRADED. | Dùng `z.number()` thay cho `z.coerce.number()`. Nếu client gửi string thì parse tường minh và từ chối `null`/`''`. |
| EXE-05 | Medium | `src/packages/entities/exercise/exercise.schema.ts:3-7` | `fileUrlSchema.url` và `key` chỉ là `z.string()`, không kiểm tra scheme hay format. Giá trị này được lưu và trả lại client qua `ExerciseDetailDto.issueUrls/exerciseUrls`. | Gửi `url: "javascript:..."` hoặc URL nội bộ. Nếu frontend render làm `href`/`src` thì có rủi ro XSS hoặc SSRF. Chưa xác minh phía frontend và tutor-service. | `url: z.string().url()` với allowlist scheme `https:` (và host storage nếu có). Validate `key` theo format key của upload service. |
| EXE-06 | Low | `src/features/exercise/exercise.controller.ts:90, 103, 122` | `@Param('id') _id: string` không có `ParseUUIDPipe`, trong khi `student.controller.ts` có dùng. ID không phải UUID đi thẳng xuống RPC. | `GET /exercises/abc` đi qua RPC, downstream lỗi DB (uuid cast) và gateway trả 500 "Internal server error" thay vì 400. | Thêm `new ParseUUIDPipe()` vào các param `id`. |
| EXE-07 | Low | `src/features/exercise/exercise.controller.ts:94-109` | `submit` (PATCH `:id/submit`) không có `@Roles`, nên TUTOR và ADMIN cũng gọi được. Quyền sở hữu của student chỉ được kiểm tra ở downstream qua `userId`. | Tutor gọi submit trên exercise của student khác nếu owner không kiểm tra role/ownership. Chưa xác minh. | Thêm `@UseGuards(RolesGuard) @Roles('STUDENT')` nếu nghiệp vụ chỉ cho student nộp bài. Hoặc xác nhận owner check. |
| EXE-08 | Low | `src/packages/entities/exercise/exercise.dto.ts:14, 16-30` | `ExerciseStatus` và `ExerciseDetailDto` được viết tay. `conventions.md` yêu cầu DTO là `z.infer<>`, không viết interface tay. `ExerciseStatus` trùng với `exerciseStatusEnum`. | Khi enum đổi trong schema, type viết tay có thể lệch. | `export type ExerciseStatus = z.infer<typeof exerciseStatusEnum>`. Derive `ExerciseDetailDto` từ schema response, hoặc giữ nguyên nếu chấp nhận ngoại lệ. Chưa xác minh việc `ExerciseDetailDto` có được import ở đâu không (không chạy được grep). |
| EXE-09 | Low | `src/features/rabbitmq/rmq.producer.ts:172-174` | Timeout trên POST `exercise.create` không bị retry (đúng, nhờ `isIdempotentPattern`). Nhưng lỗi kết nối không phải timeout và không phải business error vẫn được retry. Với `create`, nếu responder đã xử lý xong nhưng ack thất bại, retry có thể tạo bản ghi trùng. | Mất kết nối RMQ sau khi tutor-service đã insert exercise, gateway retry, tạo exercise thứ hai. Chưa xác minh khả năng này trong thực tế. | Với pattern không idempotent, chỉ retry khi lỗi xảy ra trước khi publish (hoặc gắn idempotency key). Đây là vấn đề chung của producer, không riêng exercise. |
| EXE-10 | Low | `src/features/exercise/exercise.controller.ts:47-128` | Các handler không dùng `requestId` tracking (`[SEND-START]`/`[SEND-SUCCESS]`) theo `conventions.md`. Repo-wide, chỉ có `rmq.producer.ts` log theo pattern này. | Khó correlate log khi debug production. | Hoặc áp dụng convention cho tất cả controller, hoặc cập nhật `conventions.md` cho khớp thực tế. |

## Phụ thuộc cần repo khác (nếu có)
- Các pattern cần kiểm tra ở `tutor-service` (`*.rpc.controller.ts`): `exercise.create`, `exercise.getAll`, `exercise.getById`, `exercise.submit`, `exercise.grade`. Cần xác minh ownership/role check (EXE-01, EXE-02, EXE-07) và việc lưu `status` từ create (EXE-03).
- Chưa xác minh: có `@ApiBody` / `src/data/swaggers/data/exercise.swagger.ts` cho các body schema không (không chạy được `ls`/`grep`).
- Chưa xác minh: `RMQ_SLOW_*` / `RMQ_SLOW_PREFIX_POLICIES` không có entry cho `exercise`, nên dùng timeout mặc định 10s.

## Đã đọc
- `.claude/agents/gw-module-reviewer.md`
- `CLAUDE.md`
- `.claude/rules/conventions.md`
- `.claude/rules/nestjs-feature-pattern.md`
- `src/features/exercise/exercise.controller.ts`
- `src/features/exercise/exercise.module.ts`
- `src/packages/entities/exercise/exercise.schema.ts`
- `src/packages/entities/exercise/exercise.dto.ts`
- `src/packages/entities/exercise/index.ts`
- `src/features/rabbitmq/rmq.producer.ts`
- `src/features/rabbitmq/rmq.constants.ts` (một phần: routing, policy, `isIdempotentPattern`)
- `src/features/student/student.controller.ts` (một phần: tham chiếu `ParseUUIDPipe`)
- `src/app.module.ts` (đăng ký `ExerciseModule` tại dòng 16 và 49)

Ghi chú về công cụ: Bash bị giới hạn tạm thời trong lúc review, nên không chạy được `grep` để xác minh usage của `ExerciseDetailDto`, `ExerciseStatus` và `@Roles`/`CurrentUser` decorator. Các điểm này được đánh dấu chưa xác minh.
