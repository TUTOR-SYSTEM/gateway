# Báo cáo review tổng thể — Tutor Management

Ngày: 2026-10-11. Phương pháp: 7 sub-agent đọc tĩnh song song, mỗi agent một phạm vi, chỉ đọc source (không sửa code, không gọi API, không ghi DB). Kiểm tra tự động bổ sung: `tsc --noEmit` và Vitest chạy trực tiếp.

## 1. Tổng quan

| Phạm vi | Báo cáo chi tiết | Critical | High | Medium | Low | Tổng |
|---|---|---|---|---|---|---|
| Gateway (HTTP edge) | [gateway.md](gateway.md) | 4 | 11 | 16 | 17 | 48 |
| THIRD_SERVICE (redis, log, notification, upload, test-scenario) | [third-service.md](third-service.md) | 2 | 13 | 14 | 11 | 40 |
| tutor-service phần a–l (agents, chapter, class, curriculum, exercise, lesson, ...) | [tutor-service-a.md](tutor-service-a.md) | 1 | 9 | 21 | 16 | 47 |
| tutor-service phần m–z (chat, notification, student, tuition, user, ...) | [tutor-service-b.md](tutor-service-b.md) | 0 | 10 | 17 | 18 | 45 |
| USER (auth, user, admin) | [user-service.md](user-service.md) | 4 | 10 | 10 | 17 | 41 |
| TUTOR-UI app / lib / hooks / zustand | [ui-app-lib.md](ui-app-lib.md) | 0 | 3 | 6 | 11 | 20 |
| TUTOR-UI components | [ui-components.md](ui-components.md) | 0 | 6 | 16 | 12 | 34 |
| **Tổng** | | **11** | **62** | **100** | **102** | **275** |

Các con số trên lấy từ báo cáo tổng kết của từng agent. Đếm lại bằng grep không khớp vì bảng tóm tắt trong file cũng có chữ "Critical"/"High".

Kiểm tra tự động:

| Project | Type-check | Test / Lint |
|---|---|---|
| gateway, tutor-service, USER, THIRD_SERVICE | Pass (0 lỗi) | Chưa chạy lint/test trong lượt này |
| TUTOR-UI | Fail: 4 lỗi, đều trong `test/` | Vitest: 369 pass, 1 expected fail, 1 todo. ESLint: 3 error, 57 warning |

## 2. Rủi ro nghiêm trọng nhất (Critical)

Đây là các lỗi có thể khai thác ngay, ưu tiên sửa trước.

1. **Đọc session và JWT của người khác qua Redis** — `GET /redis?key=` và RPC `redis.get` trả giá trị của mọi key, không kiểm tra role hay chủ sở hữu. Key `session:<userId>` chứa session JWT, nên STUDENT có thể lấy token của ADMIN. Lỗi này đã được xác nhận live trong báo cáo trước đó. *(gateway C-02, third-service F-01)*
2. **Route health công khai lộ dữ liệu** — `GET /health/redis` và `GET /health/postgres` là `@Public()`, trả giá trị key session và dữ liệu user mẫu. *(gateway C-03, third-service F-02)*
3. **Upload R2 hoàn toàn công khai** — upload, download và xóa file đều `@Public()`, không giới hạn kích thước hay prefix. Ai biết key đều xóa được bài nộp của học sinh. *(gateway C-01, third-service F-06, F-07, F-08)*
4. **Leo quyền qua user API** — `UserController` không có `RolesGuard`, STUDENT tạo được ADMIN, sửa và xóa user khác. RPC admin (`user.createUser`, `updateUserByAdmin`, `deleteUserByAdmin`) không kiểm tra quyền và nhận `role` từ payload. *(gateway C-04, user-service U-03)*
5. **Học sinh/phụ huynh tạo qua API có mật khẩu cố định** — `Student@123456` và `Parent@123456`, kết hợp với email mặc định có thể đoán được. *(user-service U-02)*
6. **Route `/students` không có kiểm tra quyền** — list, detail, update, delete, create đều không kiểm tra role hay ownership. *(user-service U-01)*
7. **Refresh token lưu nguyên bản trong Redis** — `session:{userId}` không hash refresh token. Ai đọc được Redis (xem mục 1) đều có refresh token hợp lệ. *(user-service U-04)*
8. **Curriculum không kiểm tra chủ sở hữu** — PUT và DELETE curriculum cho phép bất kỳ user đăng nhập nào sửa hoặc xóa. Xóa curriculum còn cascade xóa chapter và lesson. *(tutor-service-a C-01)*

## 3. Các chủ đề lặp lại (cross-cutting)

Nhiều lỗi có cùng nguyên nhân gốc. Sửa theo chủ đề sẽ hiệu quả hơn sửa từng dòng.

| Chủ đề | Biểu hiện | Ví dụ |
|---|---|---|
| **Thiếu RolesGuard / ownership** | Route và RPC không kiểm tra role hoặc người sở hữu | `/students`, `/users`, `/chapter`, `/lesson`, `/exercises/:id/grade`, `/notifications/:id`, `/curriculum` PUT/DELETE |
| **Chat WebSocket và chat REST không kiểm tra thành viên** | Join room, typing, read receipt, thêm participant đều bỏ qua ma trận quyền | tutor-service-b F-01..F-05, tutor-service-a H (`conversation:join`) |
| **Fallback JWT secret cứng (fail-open)** | Thiếu env thì dùng `dev-insecure-jwt-secret`/`dev-insecure-secret`, có thể ký token giả | gateway H-06, USER, tutor-service, THIRD_SERVICE (log gateway, chat gateway); `validateRequiredEnvs` không được gọi |
| **Public route nhạy cảm** | `@Public()` trên route có side effect hoặc tốn phí | `/upload/*`, `/health/*`, `POST /run` (gọi Claude SDK), `GET /kafka/send` |
| **Lộ dữ liệu nhạy cảm trong log/response** | Password, reset token, JWT trong log hoặc response | `console.log(resetPasswordDto)` (U-07), `database.module.ts:60` log DB URL có password, `request_logs` lưu JWT và resetToken (THIRD_SERVICE F-10, F-11), hash mật khẩu trong response student (U-06) |
| **Retry ghi và lỗi infra gây treo** | RMQ/Redis lỗi làm request chờ ~30s, retry cả thao tác ghi | `RmqProducer.send` (gateway H-08, H-09), `redis` offline queue (THIRD_SERVICE F-14), refresh fail-open (U-08) |
| **Token phía client** | Logout không xóa đủ token, token trong URL OAuth, socket đọc token một lần | ui-app-lib H1, H2, H3, M1, M3; ui-components F-05 |
| **Không transaction / dữ liệu bị xóa ngoài ý muốn** | PUT lớp với `studentIds=[]` xóa roster; PUT tuition chỉ đổi `amount` làm `PAID` thành `UNPAID` | tutor-service-a H-08, tutor-service-b F-06 |
| **Lỗi đặc tả UI với BE** | UI gửi giá trị không khớp schema BE | `parentRelationship="MALE"` (F-01), `classCode` bị strip (F-02), trang học phí chỉ lấy 100 bản ghi (F-06) |
| **Log / UI không ổn định** | Sai status code, message lỗi, fallback sai | Login sai mật khẩu trả 400 thay vì 401 (USER), chat AI luôn trả fallback (tutor-service-b F-08), `?? []` sau `unwrapApiData` (ui-app-lib M6) |

## 4. Đề xuất thứ tự sửa

**Giai đoạn 1 — chặn lỗ hổng khai thác ngay (1–2 ngày)**
1. Thêm `RolesGuard` và kiểm tra ownership cho `redis`, `users`, `students`, `curriculum`, `chapter`, `lesson`, `notifications`.
2. Bỏ `@Public()` khỏi `/upload/*`, `/health/*`, `/run`, `/kafka/send`. Nếu cần public, giới hạn theo role và kích thước.
3. Loại bỏ fallback JWT secret. Gọi `validateRequiredEnvs` khi khởi động, thiếu biến thì không start.
4. Xóa `console.log(resetPasswordDto)`; sửa log DB URL để che password; redact `authorization`, `resetToken`, `jti` trong `request_logs`.
5. Tạo mật khẩu ngẫu nhiên hoặc bắt buộc đổi mật khẩu cho tài khoản do API tạo.

**Giai đoạn 2 — tính đúng đắn và toàn vẹn dữ liệu (3–5 ngày)**
6. Chat: kiểm tra thành viên ở `conversation:join`, `typing`, `message:read`, `addParticipant`, `createGroupConversation` và endpoint read; áp `validateChatPermission` cho người được thêm.
7. Băm refresh token trước khi lưu Redis; refresh fail-closed khi Redis lỗi.
8. Transaction và kiểm tra trước khi thao tác: PUT lớp (`studentIds`), PUT tuition (`status`), cascade của curriculum.
9. Làm lại `RmqProducer.send`: chỉ retry thao tác đọc, không retry thao tác ghi và lỗi nghiệp vụ.
10. Redis: bỏ `enableOfflineQueue` hoặc đặt timeout, tránh treo API khi Redis down.

**Giai đoạn 3 — UI (song song)**
11. Logout: gọi `clearAuthTokens()` ở mọi nhánh clear, và `queryClient.clear()`.
12. Socket: env riêng trỏ tới tutor-service, đọc token động, kết nối lại sau khi đăng nhập hoặc refresh; sửa đọc ref trong render.
13. Sửa mapping form: `parentRelationship` mặc định, `classCode`/`classId`, `studentIds` khi chưa tải xong.
14. Phân trang server cho trang học phí; sửa `?? []` sau `unwrapApiData` (tìm bằng grep).
15. Dọn 4 lỗi type trong `test/` và 3 lỗi ESLint để `npm run typecheck` và lint xanh.

## 5. Phạm vi và giới hạn

- **Đây là review tĩnh.** Các agent đọc source, không chạy runtime. Những lỗi đã có bằng chứng live là: `GET /redis` trả session của ADMIN cho STUDENT, `PUT /users` không đổi role (đã kiểm chứng), và các lỗi cũ trong `docs/api-review/gateway-bug-report.md`. Các finding khác được ghi nhận là "chưa xác minh" trong từng báo cáo.
- **Phần downstream** (USER, tutor-service, THIRD_SERVICE) được xem từ gateway ở mức hợp đồng RPC, chưa kiểm chứng live.
- **Chưa review đầy đủ:** nhiều page và component UI (classes, sessions, auth forms, layout) — danh sách cụ thể nằm ở mục "Phần chưa review" trong `ui-components.md`. Test (`test/`) và các script seed chỉ được xem qua loa.
- **Mock data còn trên page production:** `accounts`, `analytics`, `budgets` dùng dữ liệu tĩnh; `categories` gọi endpoint chưa tồn tại.
- Không chạy lint và test cho 4 service backend trong lượt này.

## 6. Tài liệu liên quan

- Báo cáo live gateway trước đó: `../api-review/gateway-bug-report.md`
- Gap report UI ↔ BE: `../api-review/gap-report.md`
- Danh sách route gateway: `../api-review/gateway-route-table.md`
