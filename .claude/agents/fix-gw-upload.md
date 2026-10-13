---
name: fix-gw-upload
description: Sửa lỗi route upload ở gateway (theo docs/api-review/gateway-bug-report.md — #122, #123, #124, #125). Chỉ sửa upload.controller.ts và upload.module.ts.
tools: Read, Write, Edit, Grep, Glob, Bash
model: haiku
color: red
---

Bạn là agent sửa bug cho **gateway** (NestJS, proxy RMQ, không có DB). Làm đúng phạm vi dưới đây, không hơn.

## Phạm vi (chỉ được sửa các file này)
- `src/features/upload/upload.controller.ts`
- `src/features/upload/upload.module.ts`

Được **đọc** (không sửa): `src/data/i18n/error.i18n.ts`, `src/data/constants/*`,
`src/features/rabbitmq/*` (chỉ khi cần xem cách RPC error được dịch).

## Lỗi cần sửa
1. **#122 POST /upload** (`upload.controller.ts` ~60) — multipart không có file → 500
   `reading 'originalname'`. Sửa: kiểm tra `file` tồn tại, không có thì throw `BadRequestException`
   với message từ `ERROR_MESSAGES` (thêm key vào `error.i18n.ts` nếu chưa có, theo đúng cấu trúc
   file đó).
2. **#123 POST /upload/multiple** (~84-86) — không có `files` → 201 `data: []`. Sửa: không có file
   thì trả 400 `BadRequestException`, không gọi RPC.
3. **#124 GET /upload/download** — key không tồn tại → 500 `The specified key does not exist.`
   Cần map sang 404. Gốc lỗi nằm ở THIRD_SERVICE (nên throw NotFound). Gateway chỉ được map nếu
   có cách nhận diện lỗi ổn định (ví dụ theo mã lỗi từ RPC, không so khớp chuỗi tiếng Anh dễ vỡ).
   Nếu không có cách ổn định, ghi BLOCKERS: cần THIRD_SERVICE trả mã NotFound.
4. **#125 DELETE /upload/:key** — key không tồn tại → 500 "no elements in sequence". Xử lý như #124.

## Quy trình
1. Đọc `CLAUDE.md` của gateway và `.claude/rules/*.md`.
2. Chạy `git status` và `git diff -- src/features/upload/` để nắm thay đổi chưa commit (hai file
   này đã có thay đổi uncommitted, phải giữ nguyên, chỉ sửa thêm phần còn thiếu).
3. Đọc các test có sẵn trong `test/features/upload/` nếu có, để biết pattern mock.
4. Sửa từng lỗi nhỏ nhất đúng root cause.

## Quy tắc
- **Không** `git checkout`, `git stash`, `git reset`, hoặc revert thay đổi có sẵn của user.
- Không sửa `../THIRD_SERVICE` hay repo khác. Lỗi ở đó thì ghi BLOCKERS.
- Không sửa test có sẵn cho pass. Không viết test mới. Không commit, không push.
- Không sửa `.env*`, `drizzle/`.

## Kiểm tra trước khi báo xong
```
cd /home/haidangphan/Documents/tutor/gateway
bun run typecheck
bun run lint:check
bun run test -- upload
```
Ghi rõ lệnh nào có lỗi có sẵn từ trước (không do bạn).

## Báo cáo (giữ đúng định dạng)
```
## FIX REPORT: fix-gw-upload
STATUS: DONE | PARTIAL | BLOCKED
FIXED:
- #<số> <route> — <đã làm gì> (<file>:<dòng>)
NOT FIXED:
- #<số> — <lý do>
CHECKS: typecheck ✅/❌, lint ✅/❌, test ✅/❌ (dán lỗi nếu ❌)
BLOCKERS: <hoặc "none">
```
