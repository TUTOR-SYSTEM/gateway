# Bug review — module `ai-chat`

Ngày: 2026-10-16
Phạm vi: `src/features/ai-chat/` + entity `src/packages/entities/ai-chat/` + `src/features/rabbitmq/` (routing/policy/retry) + owner `tutor-service/src/features/agents/` (đối chiếu contract).
Không build/test, chỉ đọc tĩnh.

| Mức | Số lượng |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 1 |
| Low | 4 |

## Bug

| ID | Mức | File:dòng | Vấn đề | Kịch bản lỗi | Hướng sửa |
|---|---|---|---|---|---|
| AI-03 | Medium | `src/features/ai-chat/ai-chat.controller.ts:34`; owner `tutor-service/src/features/agents/agents.service.ts:9,34-35` | Mô tả Swagger `history DB-backed` không đúng hiện trạng: tutor-service lưu history bằng `Map` in-memory (comment ghi "dev stand-in"), giới hạn 100 message/user, mất khi restart và không chia sẻ giữa các replica. | Client tin hội thoại được lưu bền vững; sau restart/redeploy hoặc khi request rơi vào replica khác thì history biến mất/khác nhau. | Sửa description cho đúng hiện trạng, hoặc chuyển tutor sang store bền vững rồi giữ description. |
| AI-01 | Low | `src/packages/entities/ai-chat/ai-chat.schema.ts` (`chatSchema.message`) | `z.string().min(1)` không `trim()`: chuỗi toàn khoảng trắng qua được validation. | Gửi `"   "` → pass Zod → tutor gọi LLM với prompt rỗng và lưu message rỗng vào history. | `z.string().trim().min(1, ...)`. Cần xác nhận `ZodValidationPipe` trả về giá trị đã parse (chưa đọc `src/packages/pipes/zod-validation.pipe.ts`). |
| AI-02 | Low | `src/features/ai-chat/ai-chat.controller.ts:35` | `@ApiBody` chỉ khai `required: ['message']`, không khai `properties.message` (string, max 4000) — lệch với `chatSchema`. | Swagger không hiện giới hạn độ dài; client gửi > 4000 ký tự chỉ nhận 400 sau khi gọi. | `schema: { type: 'object', required: ['message'], properties: { message: { type: 'string', minLength: 1, maxLength: 4000 } } }`. |
| AI-04 | Low | `src/features/rabbitmq/rmq.constants.ts:71-75`; `src/features/rabbitmq/rmq.producer.ts:174` | `ai.clearHistory` (DELETE, ghi dữ liệu) không có call policy và không khớp `isIdempotentPattern`. Lỗi không phải timeout (ví dụ lỗi kết nối) vẫn bị retry tối đa 2 lần theo default. | Retry một thao tác ghi; ảnh hưởng thấp vì clear history là idempotent về kết quả. | Thêm `'ai.clearHistory': { maxRetries: 0 }` vào `RMQ_SLOW_PATTERN_POLICIES` (hoặc map riêng cho write), hoặc ghi nhận là chấp nhận được. |
| AI-05 | Low | `src/packages/entities/ai-chat/ai-chat.schema.ts` (gateway) vs `tutor-service/src/packages/entities/ai-chat/ai-chat.schema.ts` | `chatSchema` và `getHistoryQuerySchema` được duplicate nguyên văn ở 2 repo (hiện đang giống nhau). Không có compile-time check giữa 2 repo nên có nguy cơ lệch dần khi sửa một bên. | Sửa schema một bên mà quên bên kia → gateway chấp nhận input tutor từ chối (hoặc ngược lại) với lỗi khó truy vết. | Giữ một nguồn duy nhất cho schema, hoặc thêm test so khớp giữa 2 repo. |

## Đã kiểm tra, không phát hiện bug

- Route/pattern khớp owner: `ai.chat`, `ai.history`, `ai.clearHistory` đều có `@MessagePattern` tương ứng trong `tutor-service/src/features/agents/agents.rpc.controller.ts`; prefix `ai` → `TUTOR_SERVICE` (`rmq.constants.ts`).
- Payload khớp: `{ userId, data }`, `{ userId, query }`, `{ userId }` đúng với signature của owner.
- `ai.chat` có policy `timeoutMs: 60000, maxRetries: 0` (không retry LLM call); `ai.history` là idempotent theo regex nên được retry an toàn.
- IDOR: `userId` lấy từ `@CurrentUser()`, không nhận từ client. Không có param id từ URL.
- `getHistoryQuerySchema.limit`: `z.coerce.number().int().min(1).max(200).default(50)` khớp `@ApiQuery`.
- Module được đăng ký trong `src/app.module.ts` (import + imports list).

## Chưa xác minh

- Hành vi thực tế của `ZodValidationPipe` (ảnh hưởng hướng sửa AI-01).
- Mức độ dùng thực tế của `ai.clearHistory` retry: chưa rõ có caller nào khác ngoài `DELETE /ai-chat/history`.

## Đã đọc

- `/home/haidangphan/Documents/project/gateway/CLAUDE.md`
- `/home/haidangphan/Documents/project/gateway/.claude/rules/conventions.md`
- `/home/haidangphan/Documents/project/gateway/.claude/rules/nestjs-feature-pattern.md`
- `/home/haidangphan/Documents/project/gateway/src/features/ai-chat/ai-chat.controller.ts`
- `/home/haidangphan/Documents/project/gateway/src/features/ai-chat/ai-chat.module.ts`
- `/home/haidangphan/Documents/project/gateway/src/packages/entities/ai-chat/ai-chat.schema.ts`
- `/home/haidangphan/Documents/project/gateway/src/packages/entities/ai-chat/ai-chat.dto.ts`
- `/home/haidangphan/Documents/project/gateway/src/packages/entities/ai-chat/index.ts`
- `/home/haidangphan/Documents/project/gateway/src/features/rabbitmq/rmq.constants.ts`
- `/home/haidangphan/Documents/project/gateway/src/features/rabbitmq/rmq.producer.ts` (dòng 115-150)
- `/home/haidangphan/Documents/project/gateway/src/app.module.ts` (grep, xác nhận đăng ký)
- `/home/haidangphan/Documents/project/tutor-service/src/features/agents/agents.rpc.controller.ts`
- `/home/haidangphan/Documents/project/tutor-service/src/features/agents/agents.service.ts` (grep các dòng liên quan history)
- `/home/haidangphan/Documents/project/tutor-service/src/packages/entities/ai-chat/ai-chat.schema.ts`
