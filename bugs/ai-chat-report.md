# Flow review: ai-chat

- Luồng: UI (`ui/hooks/useAiChat.hook.ts`, `ui/components/ai-chat/ai-chat.tsx`) → gateway (`gateway/src/features/ai-chat/ai-chat.controller.ts`, `packages/entities/ai-chat/ai-chat.schema.ts`) → RMQ `ai.*` → `tutor/src/features/agents/{agents.rpc.controller,agents.service}.ts`.
- Phương pháp: sub agent `flow-review-ai-chat`, **chỉ đọc, chưa chạy test**. Ngày 2026-10-17.
- Verdict: **OK** (0 Critical, 0 Major, 6 Minor). Tổng hợp chung: `auth-report.md` mục 5.

## Bảng luồng
| UI | HTTP | RMQ | Khớp? |
|---|---|---|---|
| `useAiChat`, `ai-chat.tsx` (`usePost("/ai-chat/chat")`) | POST /ai-chat/chat | `ai.chat` `{userId, data:{message}}` | Có |
| (không có UI) | GET /ai-chat/history | `ai.history` `{userId, query:{limit}}` | Khớp GW↔SVC, UI chưa dùng |
| (không có UI) | DELETE /ai-chat/history | `ai.clearHistory` `{userId}` | Khớp GW↔SVC, UI chưa dùng |

`ai` → `TUTOR_SERVICE` (`rmq.constants.ts:46`); `ai.chat` có timeout 60s, 0 retry (`:72`).

## Major
Không còn bug mở.

## Minor

| ID | Mức | Nội dung |
|---|---|---|
| — | Minor | Service lưu lịch sử theo `userId` nhưng `this.run(data.message)` (`agents.service.ts:59`) không kèm ngữ cảnh, nên model không thấy lịch sử hội thoại; comment "server giữ ngữ cảnh" ở `useAiChat.hook.ts:16` chưa đúng về phía model. |
| — | Minor | History lưu trong bộ nhớ process (`agents.service.ts:34-35`, comment "dev stand-in"): mất khi restart, không đồng bộ nhiều replica. |
| — | Minor | `GET`/`DELETE /ai-chat/history` chưa có UI nào gọi. |
| — | Minor | Logic gọi `/ai-chat/chat` lặp ở `useAiChat` và `AiChatPage` (`ai-chat.tsx`), xử lý lỗi khác nhau (`getErrorMessage` vs chuỗi cứng). |
| — | Minor | `AiChatPage.onError` (`ai-chat.tsx:41-48`) nuốt thông điệp lỗi thật (504, rate limit), chỉ hiện câu chung. |
| — | Minor | Route `ai-chat` số ít (tên feature, không phải tài nguyên). |

## Sạch
`userId` từ `@CurrentUser()`; không `@Public()`; history theo `userId` nên không IDOR; `POST /ai-chat/chat` có `@Throttle` (10/phút); `limit` dùng `z.coerce.number()` có `.default(50)`; schema Zod gateway và tutor trùng nhau; controller không có business logic, dùng `RmqProducer`; UI đọc `reply` dạng string.

## Chưa xác minh
`unwrapApiData` có bóc thêm tầng; cấu hình API key Anthropic của tutor (không đọc `.env*`).
