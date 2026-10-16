# Bug review — module `upload`

Ngày: 2026-10-16
Phạm vi: `src/features/upload/` + `src/features/rabbitmq/` (route/timeout/producer) + `src/app.module.ts` + `src/data/i18n/error.i18n.ts`.
Không build/test, chỉ đọc tĩnh.

| Mức | Số lượng |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 3 |
| Low | 6 |

## Bug

| ID | Mức | File:dòng | Vấn đề | Kịch bản lỗi | Hướng sửa |
|---|---|---|---|---|---|
| UPL-01 | Medium | `src/features/upload/upload.controller.ts:76-126` | Không validate file type. Không có `ParseFilePipe`/`FileTypeValidator`, không allowlist MIME hoặc extension, không kiểm magic bytes. `mimetype` là giá trị client tự khai và được forward nguyên xuống `upload.upload`/`upload.uploadMultiple`. File 0 byte cũng được chấp nhận. Giới hạn size chỉ có ở multer (10MB). | Người dùng đã đăng nhập (mọi role) upload HTML/SVG/file thực thi với `mimetype: image/png`. Nếu R2 được serve public hoặc third-service giữ `mimetype` làm Content-Type, có rủi ro stored XSS/phát tán mã độc. Mức phụ thuộc cấu hình R2 (chưa xác minh). | Thêm `ParseFilePipe` với `FileTypeValidator` (allowlist) và `MaxFileSizeValidator`, reject size 0. Kiểm magic bytes ở gateway hoặc third-service. Không tin `mimetype` từ client. |
| UPL-02 | Medium | `src/features/upload/upload.controller.ts:128-152` | `GET /upload/download` không có `@Roles`/`RolesGuard`/kiểm tra ownership. Global `JwtAuthGuard` chỉ xác thực user, không kiểm tra quyền trên object. Mọi user đã đăng nhập tải được mọi object dưới `uploads/` nếu biết key. | Học sinh A tải avatar/tài liệu của học sinh B nếu biết key (key là UUID nhưng có thể lộ qua response, log, hoặc URL đã chia sẻ). Đối lập với `DELETE` có `@Roles('ADMIN')`. | Xác định rule đọc file nào là private. Nếu cần kiểm tra owner, truyền `userId` và `role` xuống owner service giống pattern `delete` (role gửi kèm payload). Nếu file là public thì ghi rõ trong Swagger. |
| UPL-03 | Medium | `src/features/upload/upload.controller.ts:102, 116-126`; `src/features/upload/upload.module.ts:8-11` | `memoryStorage` không có giới hạn tổng body. `FilesInterceptor('files', 10)` cho phép 10 × 10MB = 100MB buffer trong RAM mỗi request. Sau đó `toString('base64')` (×1.33) và gom vào một `RmqRecord`. Không có rate limit hay giới hạn concurrency. | Vài request `uploadMultiple` song song từ một tài khoản gây OOM gateway (DoS bởi user đã đăng nhập). | Chuyển sang `diskStorage` hoặc stream. Giới hạn tổng kích thước request và số request đồng thời theo user. Cân nhắc rate limit cho route upload. |
| UPL-04 | Low | `src/features/upload/upload.controller.ts:91-98, 118-125` | `originalname` do client gửi được forward nguyên xuống third-service, không sanitize basename, `..`, `/`, `\`. Gateway không thấy cách downstream dùng nó. | Nếu `third-service` đưa `originalname` vào R2 key, client có thể ghi key ngoài `uploads/` hoặc đè file khác. Mức Low vì chưa xác minh được từ repo này. | Sanitize `originalname` ở gateway (basename + thay ký tự nguy hiểm). Kiểm tra ở `third-service` rằng key luôn do server sinh (UUID) và không dùng `originalname` trực tiếp. |
| UPL-05 | Low | `src/features/upload/upload.controller.ts:137-139` | Query `key` không qua Zod/`ZodValidationPipe` (conventions yêu cầu mọi query phải validate). `assertValidKey` gọi `key.startsWith`. Express (qs) trả về array/object khi có `?key=a&key=b` hoặc `?key[x]=y`, khiến `startsWith` ném TypeError. | `GET /upload/download?key[]=x` trả 500 thay vì 400. Sai status code, lộ stack trace nếu debug. Tương tự `DELETE` nếu path param bị decode bất thường (hiện tại path param luôn là string). | Thêm Zod schema `z.string().startsWith('uploads/')` cho query `key` qua `ZodValidationPipe`, hoặc kiểm `typeof key === 'string'` trước `assertValidKey`. |
| UPL-06 | Low | `src/features/upload/upload.controller.ts:140-144` | `result` trả về từ `upload.download` không được kiểm tra null/undefined trước `result.buffer`. Swagger ghi `404 File not found in R2` nhưng code không có nhánh 404 riêng. | Nếu third-service trả `null` khi object không tồn tại (thay vì throw `NotFoundException`), client nhận 500 "Internal server error" thay vì 404 như Swagger. Cần xác minh ở owner service. | Thêm `if (!result?.buffer) throw new NotFoundException(...)` (dùng message từ `ERROR_MESSAGES`). Hoặc xác nhận owner luôn throw NotFound và ghi rõ trong code. |
| UPL-07 | Low | `src/features/upload/upload.controller.ts:140-144` | `download` nhận toàn bộ object dưới dạng base64 trong một message RMQ và buffer hết trong RAM. Không có giới hạn kích thước phía gateway. Timeout 60s (từ `rmq.constants.ts:77`) áp dụng cho cả download. | Object lớn (vượt 10MB do upload trước đó hoặc bypass từ owner) làm gateway tốn RAM và có thể timeout. Mức Low vì giới hạn upload hiện là 10MB. | Trả về stream hoặc signed URL thay vì base64 qua RMQ. Ít nhất thêm kiểm tra kích thước `result.size` trước khi decode. |
| UPL-08 | Low | `src/features/upload/upload.controller.ts:63, 102, 91-98, 118-125`; `src/features/upload/upload.module.ts:10` | Magic number lặp: `10 * 1024 * 1024` và `10` file khai báo hai nơi (controller và module), có thể lệch khi sửa. Mapping `{originalname, mimetype, size, buffer}` lặp hai lần. | Sửa giới hạn ở một chỗ mà chỗ kia không đổi, khi đó multer và `FileInterceptor` cho ra hai giới hạn khác nhau. | Đưa `MAX_FILE_SIZE`, `MAX_FILES` vào một constant chung (ví dụ `upload.constants.ts`). Tách hàm `toRpcFile(file)` dùng chung. |
| UPL-09 | Low | `src/features/upload/upload.controller.ts:89-99, 116-126, 140-144`; `src/features/rabbitmq/rmq.producer.ts:189-193` | Gateway trả nguyên response của `upload.upload`/`uploadMultiple` và message lỗi 4xx từ downstream (producer giữ `payload.message` khi status < 500). Có thể lộ endpoint/bucket R2 nội bộ nếu third-service đưa vào response. Ngoài ra `HttpExceptionFilter` có surface `serviceName` (theo conventions), lộ tên service nội bộ. Cross-cutting, ngoài phạm vi module này. | Response upload chứa `url` trỏ tới endpoint R2 nội bộ hoặc message 4xx chứa chi tiết nội bộ, client thấy được. | Whitelist field trả về ở gateway (ví dụ chỉ `key`, `url` public). Với 4xx, dùng message từ `ERROR_MESSAGES`. Xác minh shape response ở `third-service`. |

## Phụ thuộc cần repo khác (nếu có)

Gateway chỉ forward. Các điểm sau cần kiểm tra ở `third-service`, không tự kết luận:

- `upload.upload` / `upload.uploadMultiple`: có validate MIME/magic bytes không. Có dùng `originalname` trong R2 key không (UPL-01, UPL-04). Response có chứa URL/endpoint nội bộ không (UPL-09).
- `upload.download`: throw `NotFoundException` hay trả `null` khi object không tồn tại (UPL-06). Có giới hạn kích thước object không (UPL-07).
- `upload.delete`: `role` lấy từ payload gateway, owner service phải tin gateway (kiến trúc hiện tại), không có endpoint nào gọi trực tiếp bỏ qua gateway.
- Xác định object nào trong `uploads/` là private (avatar, tài liệu học sinh) để đánh giá UPL-02.

## Đã đọc

- `/home/haidangphan/Documents/project/gateway/.claude/agents/gw-module-reviewer.md`
- `/home/haidangphan/Documents/project/gateway/CLAUDE.md` (đã có trong context)
- `/home/haidangphan/Documents/project/gateway/.claude/rules/conventions.md`
- `/home/haidangphan/Documents/project/gateway/.claude/rules/nestjs-feature-pattern.md`
- `/home/haidangphan/Documents/project/gateway/src/features/upload/upload.controller.ts`
- `/home/haidangphan/Documents/project/gateway/src/features/upload/upload.module.ts`
- `/home/haidangphan/Documents/project/gateway/src/features/rabbitmq/rmq.constants.ts`
- `/home/haidangphan/Documents/project/gateway/src/features/rabbitmq/rmq.producer.ts` (các đoạn liên quan đến logging, `toRpcErrorPayload`, sanitize 5xx)
- `/home/haidangphan/Documents/project/gateway/src/app.module.ts` (grep: đã đăng ký `UploadModule` ở dòng 24, 57)
- `/home/haidangphan/Documents/project/gateway/src/data/i18n/error.i18n.ts` (grep: các key `UPLOAD_*` tồn tại)
- `src/packages/entities/` (liệt kê: không có thư mục `upload`, nên upload không có Zod schema riêng)
