# Thống kê lỗi theo source

Ngày review: 2026-10-15. Review tĩnh bằng 5 sub agent song song, không sửa source, không chạy build/test.

| Source | Report | Critical | High | Medium | Low | Tổng |
|---|---|---:|---:|---:|---:|---:|
| gateway | [gateway-bugs.md](gateway-bugs.md) | 0 | 2 | 15 | 12 | 29 |
| user | [user-bugs.md](user-bugs.md) | 0 | 5 | 17 | 15 | 37 |
| tutor | [tutor-bugs.md](tutor-bugs.md) | 0 | 4 | 18 | 15 | 37 |
| third | [third-bugs.md](third-bugs.md) | 0 | 1 | 7 | 17 | 25 |
| ui | [ui-bugs.md](ui-bugs.md) | 0 | 3 | 11 | 10 | 24 |
| **Tổng** | | **0** | **15** | **68** | **69** | **152** |

## Lỗi High

| ID | Mô tả ngắn |
|---|---|
| GW-01 | `currentPassword` không bị che trong `logger.interceptor.ts`, ghi plaintext vào log và `request_logs` |
| GW-02 | Không có rate limiting, `Throttle` chỉ là metadata, không guard nào đọc |
| US-01 | OAuth tự gộp vào tài khoản STUDENT theo email chưa xác minh |
| US-02 | `GET /students/:id` không kiểm tra `tutorId` |
| US-03 | Phụ huynh không email lưu `email=''`, vi phạm unique, lỗi 500 |
| US-04 | `LoggerInterceptor` ghi `currentPassword` và `jti` vào log |
| US-05 | Thiếu env thì JWT ký bằng secret cứng |
| TU-01 | Curriculum không validate body, mass assignment đổi được `userId` |
| TU-02 | `addParticipant` thêm user vào mọi hội thoại, bỏ qua quyền chat |
| TU-03 | `createGroupConversation` không kiểm quyền/validate |
| TU-04 | `GET /classes` lộ email/phone học sinh cho STUDENT/PARENT |
| TH-01 | RPC `redis.get/set/del` không giới hạn key, đọc/ghi đè được session và token |
| UI-01 | Socket đọc token lúc mount khi store chưa hydrate, không kết nối |
| UI-02 | Ngày UTC trộn giờ local, sửa buổi học có thể sai ngày |
| UI-03 | Chat gửi khi socket null bị bỏ qua nhưng vẫn xoá draft |

## Lưu ý

- Không có lỗi Critical nào, theo đánh giá của từng agent.
- Một số lỗi trùng giữa các service (log `currentPassword`, OAuth email chưa xác minh, `GET /students/:id`, JWT chỉ lấy role từ token), nên số độc lập thấp hơn 152.
- Hai điểm chưa xác minh được bằng đọc tĩnh: `APP_GUARD` có áp lên handler RPC không, và contract gateway với user (`user.createUser`).
- Agent `ui` chỉ đọc chọn lọc các file rất lớn, danh sách chưa toàn diện.
- Chưa có cross-check giữa các agent. Nên xác minh lại các lỗi High trước khi sửa.
