# Báo cáo bug: gateway

Cập nhật: 2026-11-28. Trạng thái theo code hiện tại trong working tree (chưa commit).
Trạng thái: **Đã fix** = xong và có kiểm chứng; **Fix một phần** = đã sửa phần chính, còn việc; **Chưa xong** = chưa sửa.

| ID | Mức độ | Loại | Vấn đề | Trạng thái | Còn cần làm |
|---|---|---|---|---|---|
| GW-15 | Low | Security | Facebook không kiểm tra email đã xác minh | Chưa xong | Không đổi code. Cần xác nhận với tài liệu Meta (nguồn tìm được là bên thứ ba). |
| GW-17 | Info | Design | Cache session dương 5 giây | Chưa xong | Chỉ ghi nhận, không sửa. |
| GW-02 | High | Security | Identity gửi sang tutor/third không ký | Fix một phần | Seal `userId`/`role` đã có ở gateway và tutor, verify ở tutor/third. Còn: replay guard ở tutor/third, ACL broker theo queue (hạ tầng). Deploy gateway trước. |
| GW-05 | Medium | Availability | Rate limit theo IP quá chặt cho NAT dùng chung | Fix một phần | Route đã xác thực đếm theo user. Cần xác minh runtime thứ tự guard. Route chưa xác thực (login, register) vẫn theo IP. |
| GW-14 | Low | Security | GET thiếu RolesGuard | Fix một phần | Chỉ `GET /tuitions/summary` được giới hạn ADMIN/TUTOR. Owner cần xác nhận quyền của `api-routes` và `course-progress`. Tutor-service: `tuition.canRead` không cho PARENT đọc. |
| GW-16 | Info | Hardening | Schema không giới hạn kích thước | Fix một phần | `notification.metadata` đã giới hạn 10 KB. Còn `course-progress` (giới hạn số khoá). |
| GW-01 | High | Security | Redis publish 6379 không mật khẩu | Đã fix | Thêm `REDIS_PASSWORD` vào `.env`. `docker-compose.infra.yml` và `docker-compose.dev.yml` vẫn không có mật khẩu (chỉ bind loopback). |
| GW-04 | Medium | Security | Swagger bật ở production | Đã fix | Đặt `SWAGGER_ENABLED=true` nếu cần xem docs khi production. |
| GW-06 | Low | Bug | `auth.verifyEmail` bị retry | Đã fix | - |
| GW-07 | Low | Security | Blocklist `GET /redis` thiếu `verify-email:` | Đã fix | - |
| GW-08 | Low | Bug | ZodError thành 500 ở `PUT /api-routes/results/:id` | Đã fix | - |
| GW-09 | Low | Bug | JSON.parse param làm `correlationId` toàn số bị 422 | Đã fix | - |
| GW-10 | Low | Security | Fallback `guest:guest` cho RabbitMQ | Đã fix | - |
| GW-11 | Low | Security | Route debug `/kafka/*`, `/health/postgres` chạy production | Đã fix | Đặt `ENABLE_DEBUG_ROUTES=true` nếu cần dùng ở production. |
| GW-19 | Low | Cleanup | Logic `/test-scenarios` còn sót ở gateway, third, tutor (prisma) và tài liệu | Fix một phần | Đã gỡ route/module/schema/i18n/env/tài liệu/script (2026-11-28, chưa commit); tài liệu `flow.d`, `bugs/test-scenario-report.md` đã xoá. Còn: tạo migration DROP `test_scenarios`, `test_runs`, `test_fixtures` (gateway drizzle, tutor prisma) và chạy trên DB — chưa làm, cần chủ repo xác nhận. |
| GW-12 | Low | Security | TestScenarioModule load khi thiếu NODE_ENV | Đã fix | Module đã bị xoá khỏi working tree trước đó. |
| GW-13 | Low | Security | CORS mặc định có localhost | Đã fix | Xác nhận `CORS_ORIGINS` thật khi deploy. |
| GW-18 | Info | Hardening | Query string trong `path` của response/error | Đã fix | - |
| GW-03 | Medium | Security | Log không redact PII | Đóng | Đã xoá toàn bộ logic log request (LoggerInterceptor, log-sink, module log, route log) ở 2026-11-28, nên không còn nơi nào ghi PII vào log. Xem mục xoá log. |

## Ghi chú

- Repo tutor-service và user-service có thay đổi liên quan (seal identity ở tutor/third, `StudentService.update` giữ ADMIN+TUTOR). Chi tiết ở commit/diff của từng repo.
- Test gateway: 477/477, `tsc` sạch.
