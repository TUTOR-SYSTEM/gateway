# Bug review — module `rabbitmq`

Ngày: 2026-10-16
Phạm vi: `src/features/rabbitmq/` (lớp transport) + caller và wiring liên quan: `src/packages/guards/jwt-auth.guard.ts` (gọi `redis.exists`), `src/packages/context/log-sink.ts`, `src/packages/filters/http-exception.filter.ts`, `src/main.ts`, `src/app.module.ts`.
Không build/test, chỉ đọc tĩnh.

| Mức | Số lượng |
|---|---|
| Critical | 0 |
| High | 1 |
| Medium | 2 |
| Low | 8 |

## Bug

| ID | Mức | File:dòng | Vấn đề | Kịch bản lỗi | Hướng sửa |
|---|---|---|---|---|---|
| RMQ-01 | High | `src/features/rabbitmq/rmq.producer.ts:172-174` | `send()` retry mọi lỗi không phải timeout và không phải business error (có `statusCode`), bất kể pattern có idempotent hay không. Chỉ nhánh timeout mới kiểm tra `isIdempotentPattern`. | Ghi bị đứt kết nối khi đang chờ reply (broker restart, channel close) nhưng responder đã commit: `user.createUser` tạo trùng hoặc trả 409 cho client dù lần đầu đã thành công. Nếu owner `user` rotate refresh token ở `auth.refresh` (mặc định 2 retry), lần retry có thể dùng lại token đã bị rotate và user bị logout. Cần xác minh ở repo `user`. | Chỉ retry khi chắc message chưa publish (lỗi kết nối trước khi send), hoặc giới hạn retry theo `isIdempotentPattern` cho mọi loại lỗi. Đặt `maxRetries: 0` cho `auth.refresh`, `auth.register`, `user.createUser`, các `*.create*`. |
| RMQ-02 | Medium | `src/features/rabbitmq/rmq.producer.ts:67, 167-171` | `isRpcBusinessError` yêu cầu `statusCode` là number. Payload responder chỉ có `message` (được `toRpcErrorPayload` chấp nhận ở dòng 67) bị coi là lỗi hạ tầng và bị retry, kể cả với write. Chưa xác minh: shape lỗi thực tế của `RpcExceptionFilter` ở repo owner. | Responder trả lỗi nghiệp vụ dạng `{ message }` cho `user.createUser`: gateway gọi lại 2 lần, responder chạy lại logic ghi mỗi lần, latency tăng thêm backoff và timeout. | Coi mọi payload lỗi có `message` từ responder là deterministic (không retry). Chỉ retry với lỗi transport (không phải payload RPC). Kiểm tra `RpcExceptionFilter` ở `user`/`tutor-service`/`third-service`. |
| RMQ-03 | Medium | `src/features/rabbitmq/rmq.producer.ts:73, 162, 177-179` | Lỗi kết nối AMQP có dạng `{ err, url }` (comment dòng 70-71 nêu rõ) được `JSON.stringify` nguyên vẹn vào `payload.message` và vào `error=`. `url` chứa credential của `RABBITMQ_URL` (`amqp://user:pass@...`). | Mỗi lần broker down hoặc sai credential, `[SEND-ATTEMPT-FAILED]` (warn) và `[SEND-FAILED]` (error) in password RabbitMQ ra log. HTTP client chỉ thấy 500 generic nên không lộ ra ngoài qua response. Chưa xác minh shape runtime của amqp-connection-manager. | Khi log, chỉ lấy `err?.code` và `err?.message`, bỏ `url`. Hoặc redact userinfo trong URL trước khi log. |
| RMQ-04 | Low | `src/features/rabbitmq/rmq.constants.ts:92` | Regex idempotent không khớp các call đọc: `report.summary`, `report.attendanceTrend`, `report.classList`, `dashboard.overview`, `log.query`, `log.trace`. Timeout trên các call này không được retry dù không có side effect, trái với comment dòng 89 ("read-only được retry"). | Report hoặc dashboard chậm bị trả 504 ngay ở lần timeout đầu thay vì thử lại. | Thêm các method này vào regex, hoặc chuyển sang danh sách explicit theo pattern. |
| RMQ-05 | Low | `src/features/rabbitmq/rmq.constants.ts:92` | Regex `^(get\|find\|list\|check\|...)` không có ranh giới từ và dùng flag `i`. Hiện tại đúng, nhưng một write mới như `getOrCreate...`, `listen...`, `checkout...`, `findOrCreate...` sẽ được coi là idempotent và bị retry sau timeout. `testscenario.fixtures.resolve` đang được coi là idempotent dù tên gợi ý có thể tạo bản ghi (chưa xác minh). | Thêm write mới có tên bắt đầu bằng prefix đọc làm timeout dẫn tới ghi trùng. | Dùng danh sách explicit, hoặc khớp `^(get\|find\|list...)([A-Z]\|$)`. Kiểm tra ngữ nghĩa `testscenario.fixtures.resolve` ở `third-service`. |
| RMQ-06 | Low | `src/features/rabbitmq/rmq.producer.ts:37-55, 133, 208-212` | `withTraceHeaders` tạo một `RmqRecord` duy nhất, nên mọi attempt chia sẻ cùng `traceId` và `correlationId`. `backoffMs` không có jitter. | Responder không phân biệt được attempt 1 và attempt 2 khi đối chiếu log. Nhiều request cùng retry có thể đồng loạt đập lại broker. | Sinh `traceId` mới cho mỗi attempt, giữ nguyên `correlationId`. Thêm jitter vào backoff. |
| RMQ-07 | Low | `src/features/rabbitmq/rmq.producer.ts:131-132`, `src/features/rabbitmq/rmq.constants.ts:67-78` | Không có deadline tổng. Call đọc mặc định: 3 lần × 10s + backoff 300ms ≈ 30,3s trước khi trả 504. `timeoutMs: 15000` kèm retry mặc định ≈ 45s. | Request HTTP treo lâu, client hoặc proxy timeout trước khi gateway trả lỗi. | Thêm tổng thời gian (`totalTimeoutMs`), hoặc giảm `maxRetries` cho call đồng bộ phục vụ HTTP. |
| RMQ-08 | Low | `src/features/rabbitmq/rmq.constants.ts:50, 82-86, 92` | Tra cứu bằng object literal thường, nên key kế thừa từ prototype (`constructor`, `toString`) trả về hàm thay vì `undefined`. Ví dụ `constructor.x` làm `resolveRmqTarget` trả về `Object`, `this.clients[...]` là `undefined`, `client.send` ném TypeError thành 500 thô. | Hiện chưa kích hoạt vì mọi pattern là literal trong code. Rủi ro khi pattern được sinh động. | Dùng `Object.hasOwn(...)` hoặc `Map`. |
| RMQ-09 | Low | `src/features/rabbitmq/rmq.producer.ts:165-174, 216-219` | Lỗi xác định (ví dụ TypeError khi serialize payload, `Error` thường) vẫn bị retry 2 lần kèm backoff. Ngược lại, responder trả 503 tạm thời không bao giờ được retry vì `isRpcBusinessError` bắt mọi statusCode. Dòng 216-219 là fallback không thể tới được. | Latency tăng vô ích khi payload lỗi. Lỗi tạm thời thật thì không được thử lại. | Tách rõ: retry chỉ cho lỗi transport. Cân nhắc retry 503 cho pattern idempotent. Xóa nhánh không tới được. |
| RMQ-10 | Low | `src/features/rabbitmq/rmq.producer.ts:185-193` | Với 4xx không có `message`, client nhận `'Message queue service unavailable'` kèm status của responder. Không kiểm tra miền statusCode: payload có statusCode 2xx hoặc 3xx tạo `HttpException` với status đó, nên filter trả `success: false` với HTTP 2xx. | Lỗi hiển thị sai và HTTP status sai. | Nếu statusCode không nằm trong 400-599 thì dùng 500 (hoặc 502). |
| RMQ-11 | Low | `src/features/rabbitmq/rmq.producer.ts:104-113` | `emit()` không có timeout và không có retry. `firstValueFrom` chờ đến khi observable hoàn tất, nên có thể treo khi broker không sẵn sàng. `app.controller.ts:49` gọi `emit('kafka.ping')`; chưa đọc ngữ cảnh HTTP của call này để xác định endpoint có bị treo không. | Endpoint health treo khi broker down. | Thêm `timeout` tương tự `send`. `log.create` trong `main.ts` là fire-and-forget nên không bị ảnh hưởng. |

## Ghi chú thiết kế (không tính là bug)

- `src/packages/guards/jwt-auth.guard.ts:161-166`: khi `redis.exists` lỗi hạ tầng, guard fail open. Session đã revoke vẫn qua được khi `third-service` hoặc broker down. Đây là quyết định được ghi trong code, cần xác nhận lại là chấp nhận được.

## Đã kiểm tra, không phát hiện bug

- Routing: mọi prefix đang dùng trong `src/**` (`user`, `auth`, `kafka`, `ai`, `tutor`-domain, `redis`, `email`, `notification`, `upload`, `log`, `testscenario`, `health.*`) đều có route trong `rmq.constants.ts`. `log.create` (emit) và `redis.exists` (guard) cũng có route.
- Thứ tự ưu tiên `timeoutMs` và `maxRetries`: `??` xử lý đúng giá trị `0` (`redis.exists`, `ai.chat`).
- Timeout của write không được retry (`unsafeToRetryTimeout`), đúng với mục tiêu tránh ghi trùng khi timeout.
- Mapping timeout sang 504 và ẩn message nội bộ với lỗi 5xx: đúng.

## Phụ thuộc repo khác (chưa xác minh, không kết luận)

1. Shape payload lỗi của `RpcExceptionFilter` ở `user`, `tutor-service`, `third-service`: có luôn kèm `statusCode` không. Quyết định mức độ của RMQ-02.
2. Ngữ nghĩa `testscenario.fixtures.resolve` (RMQ-05): có tạo bản ghi không.
3. `auth.refresh` và `ai.clearHistory`: có idempotency key hoặc cơ chế chống rotate lặp không (RMQ-01).

## Đã đọc

- `/home/haidangphan/Documents/project/gateway/CLAUDE.md`
- `.claude/rules/conventions.md`, `.claude/rules/nestjs-feature-pattern.md`
- `src/features/rabbitmq/rmq.producer.ts`, `rmq.constants.ts`, `rmq.module.ts`
- `src/packages/guards/jwt-auth.guard.ts`
- `src/packages/context/log-sink.ts`
- `src/packages/filters/http-exception.filter.ts`
- `src/main.ts`, `src/app.module.ts`
- Grep toàn bộ `rmqProducer.send|emit` trong `src/` để đối chiếu pattern và routing
