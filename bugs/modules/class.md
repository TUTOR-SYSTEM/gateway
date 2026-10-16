# Bug review — module `class`

Ngày: 2026-10-16
Phạm vi: `src/features/class/` + entity/guard/pipe liên quan (`src/packages/entities/class/*`, `src/features/rabbitmq/rmq.producer.ts`, `rmq.constants.ts`). Đối chiếu responder `tutor-service/src/features/class/class.rpc.controller.ts` và `class.service.ts`.
Không build/test, chỉ đọc tĩnh.

| Mức | Số lượng |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 1 |
| Low | 8 |

## Bug

| ID | Mức | File:dòng | Vấn đề | Kịch bản lỗi | Hướng sửa |
|---|---|---|---|---|---|
| CLASS-01 | Medium | `src/features/rabbitmq/rmq.producer.ts:172-174` (ảnh hưởng `class.create`, `class.update`, `class.addStudents`, `class.delete`) | Retry áp dụng cho mọi lỗi không phải business error và không phải timeout của write, kể cả lỗi transport (connection/channel) sau khi message đã publish. | `class.create` publish thành công nhưng reply bị mất do rớt kết nối → gateway retry → tạo lớp trùng. `class.delete` retry sau khi lần đầu đã xóa → trả 404 dù thực tế đã xóa. | Chỉ retry khi chắc chắn chưa gửi (lỗi publish trước khi ack). Với pattern không idempotent, không retry lỗi transport; hoặc gửi idempotency key cho `class.create`. |
| CLASS-02 | Low | `src/features/class/class.controller.ts:57` | `@ApiBody` của `POST /classes` khai `required: ['name','subject','tutorId']`, thiếu `code`, `startTime`, `endTime` mà Zod bắt buộc (`class.schema.ts:11,20,21`). Swagger lệch contract. | Client theo Swagger bỏ `startTime`/`endTime` → nhận 400 từ Zod. | Đồng bộ `required` với `createClassSchema`, hoặc sinh `@ApiBody` từ schema. |
| CLASS-03 | Low | `src/features/class/class.controller.ts:118,135,148,161,172,183` | Tham số `:id` khai `format: 'uuid'` trong Swagger nhưng không có `ParseUUIDPipe`. Gateway không chặn sớm id sai định dạng. Hiện downstream đã validate (`class.service.ts:226` cho `getClassService`), nên chưa gây 500 trong các đường đã kiểm tra. | Id không phải UUID đi xuyên xuống tutor-service; đường nào downstream thiếu validate có thể trả 500 thay vì 400. | Thêm `ParseUUIDPipe` cho các `@Param('id')`. |
| CLASS-04 | Low | `src/packages/entities/class/class.dto.ts:14-33` | `ClassDetailDto` không được gateway dùng ở đâu (đã kiểm tra trong `gateway/src`). Shape (`tuition: string`, `studentCount`, ...) không được ràng buộc với response thật của tutor-service. | Type dead code, có thể lệch response thực mà không ai phát hiện. | Xóa, hoặc dùng làm kiểu response thật sự và đối chiếu với `class.service.ts`. |
| CLASS-05 | Low | `src/packages/entities/class/class.schema.ts:20-21, 38-47` | Không có kiểm tra cross-field `endTime > startTime` ở edge. `updateClassSchema` không so được khi chỉ gửi một trong hai trường. Chưa xác minh được tutor-service có kiểm tra không (lượt này không chạy được lệnh grep). | Lớp tạo/cập nhật với `endTime < startTime` có thể được lưu nếu downstream không chặn. | Xác minh trong tutor-service `class.service.ts`. Nếu thiếu thì bổ sung `.refine` ở create, và ở update khi cả hai trường có mặt. |
| CLASS-06 | Low | `src/features/class/class.controller.ts:94-112` (`PUT :id`), `src/packages/entities/class/class.schema.ts:46` | `studentIds` nằm trong `updateClassSchema` và mô tả "reconcile enrolled students", nhưng không có trong `@ApiBody` và không ghi rõ việc gửi danh sách sẽ thay thế roster. Có hai đường enroll (`PUT` và `POST /:id/students`) với ngữ nghĩa khác nhau. | Client gửi `studentIds` theo ý "thêm" nhưng thực tế bị gỡ học viên không có trong danh sách. | Ghi rõ ngữ nghĩa trong Swagger (`@ApiBody` cho `update`), hoặc bỏ `studentIds` khỏi PUT và chỉ dùng `POST /:id/students`. |
| CLASS-07 | Low | `src/features/class/class.controller.ts:53-57, 103, 107-111` | Magic string lặp: `['OPEN','CLOSED','UPCOMING']` trong `@ApiQuery` thay vì dùng `classStatusEnum.options`; `'ADMIN','TUTOR'` lặp 4 lần. | Thêm status mới vào schema mà quên Swagger/Roles. | Lấy từ `classStatusEnum.options`; gom role list thành hằng số. |
| CLASS-08 | Low | `src/features/class/class.controller.ts` (toàn file) | `conventions.md` yêu cầu controller gọi RPC có `requestId` và log `[SEND-START]/[SEND-SUCCESS]/[SEND-FAILED]`. Controller class không làm việc này. `RmqProducer` đã log, nên chỉ là lệch convention. | Khó correlate log khi debug production theo đúng quy trình trong convention. | Hoặc bổ sung theo convention, hoặc cập nhật convention cho biết `RmqProducer` đã đảm nhiệm. |
| CLASS-09 | Low | `src/features/class/class.controller.ts:172-173` (`class.getWatch`) | `getWatch` là endpoint tổng hợp nhiều query (students, schedules, recent session) nhưng dùng timeout mặc định 10s và không có policy riêng trong `rmq.constants.ts`. Là read nên được retry 2 lần, tối đa khoảng 30s trước khi trả 504. | Lớp lớn chạy chậm hơn 10s → client chờ ~30s rồi nhận 504, tải tutor-service bị nhân 3. | Đo thời gian thực tế, rồi thêm `class.getWatch` vào `RMQ_SLOW_PATTERN_POLICIES` với timeout phù hợp. |

## Đã kiểm tra, không phát hiện bug

- Thứ tự route: `GET generate-code` đứng trước `GET :id`, không bị nuốt.
- `updateClassSchema` đã `.extend` lại `tuition/status/format/schedulesId` không có default, nên không ghi đè bằng default khi update.
- Authorization cho `getStudents`, `getMaterials`, `getWatch` không có `RolesGuard`, nhưng tutor-service `loadAccessibleClass` kiểm tra quyền (`class.service.ts:301, 325, 344`). Không phải lỗi gateway.
- Payload khớp responder `tutor-service/src/features/class/class.rpc.controller.ts` cho cả 9 pattern (`class.create`, `update`, `generateCode`, `getAll`, `getById`, `addStudents`, `getStudents`, `getMaterials`, `getWatch`, `delete`).
- `class.getAll`, `class.getById`, `class.getStudents`, `class.getMaterials`, `class.getWatch` khớp `isIdempotentPattern` (đều là read), nên việc retry khi timeout là đúng.
- `ClassModule` không khai báo `imports`, phụ thuộc `RmqModule` `@Global()`. Hợp lệ theo convention.
