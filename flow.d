Đã rà lại code thật trong gateway/, THIRD_SERVICE/, TUTOR-UI/ trước khi viết plan — vì tính năng này không phải làm từ đầu, đã có sẵn khá nhiều hạ tầng. Dưới đây là plan dựa trên hiện trạng thật của repo.

0. Hiện trạng — cái gì đã có, cái gì chưa

Đã có (chạy thật, không phải mock):

Distributed tracing: correlationId/traceId/parentTraceId qua AsyncLocalStorage (gateway/src/packages/context/), tự động gắn vào mọi request HTTP + mọi lệnh RPC qua RabbitMQ.
Bảng request_logs (THIRD_SERVICE, sở hữu bởi src/features/log/) — ghi lại mọi hop thật (HTTP vào gateway + từng lệnh RPC nội bộ), có serviceName, method, path, statusCode, durationMs, request/response body, lỗi.
API đọc log: gateway GET /logs (list + filter) và GET /logs/trace/:correlationId (toàn bộ trace của 1 request) — proxy RPC log.query/log.trace sang THIRD_SERVICE.
Realtime: THIRD_SERVICE/src/features/log/log.gateway.ts — WebSocket namespace /logs, event log:new, admin-only, phát ngay khi có row mới được ghi.
FE: trang "Giám sát Request" đã tồn tại — TUTOR-UI/app/(app)/(admin)/logger/ + components/logger/*. Đã làm: danh sách request (filter Tất cả/Lỗi/Cảnh báo/Chậm/Đạt, search theo path), dialog chi tiết dạng waterfall (từng hop, request/response/processing tab), nhận log mới qua useLogSocket.
Trang "flow-requests" (TUTOR-UI/app/flow-requests/) — sơ đồ kiến trúc tĩnh (Frontend → Gateway → RabbitMQ → 3 service), CRUD thủ công danh mục endpoint theo service, có màu/badge theo service. Đây là dữ liệu tĩnh, không chạy request thật, không có pass/fail.

Chưa có (là phần khoảng cách so với 2 ảnh mẫu):

Nhóm request theo endpoint với các case/kịch bản con (Request hợp lệ, Thiếu token, Body sai schema...) kèm tỉ lệ "Case đạt X/Y".
Cột thống kê tổng hợp: Gọi/24h, P95 theo từng endpoint.
Nút "Test" / "Chạy realtime" — chủ động bắn 1 request thật theo kịch bản và theo dõi nó chạy qua từng service.
Sơ đồ pipeline ngang (CLIENT → Gateway → Auth → User → Postgres) kèm cURL copy trong dialog chi tiết.

Lưu ý: tên service trong ảnh mẫu (Auth/User/Class/Schedule/Payment/Notification/Exam Service, VNPay, eSMS) là ví dụ tổng quát — hệ thống thật chỉ có 4 service (gateway, user, tutor-service, third-service). Plan bên dưới map theo tên thật; UI vẫn có thể hiển thị nhãn "Auth"/"User"/"Class" (route domain) tách theo path prefix để giữ đúng cảm giác trực quan như ảnh.

1. Data model — "Kịch bản test" & "Lần chạy" (THIRD_SERVICE)

Thêm 2 bảng vào THIRD_SERVICE/src/database/schema.ts (dùng skill THIRD_SERVICE:generate-db-table):

test_scenarios: id, service, method, path, name, description, requestTemplate (jsonb: headers/body mẫu), expectedStatus, category (valid|auth|validation|not_found|...), createdAt/updatedAt.
test_runs: id, scenarioId (FK), correlationId, actualStatus, expectedStatus, passed (bool), durationMs, triggeredBy (userId), createdAt.

Không đụng vào request_logs — nó tiếp tục ghi mọi traffic (organic lẫn test) như hiện tại; test_runs chỉ là lớp "gắn nhãn kết quả" nối với request_logs qua correlationId.

2. Backend — feature test-scenario (THIRD_SERVICE)

Dùng skill THIRD_SERVICE:generate-feature (shape đầy đủ: controller → service → repository → module):

CRUD kịch bản (admin quản lý danh sách case cho từng endpoint).
run(scenarioId): sinh correlationId mới, bắn HTTP thật tới gateway (axios/fetch tới base URL gateway, theo đúng method/path/headers/body của requestTemplate, có gắn x-correlation-id) → request này đi qua toàn bộ hệ thống thật (gateway → RMQ → service liên quan → Postgres/Redis) và tự động được LoggerInterceptor ghi vào request_logs như bình thường. Sau khi có response, ghi 1 row test_runs (so actualStatus với expectedStatus → passed).
Thêm RPC pattern testscenario.run/testscenario.list/testscenario.stats (@MessagePattern), gateway thêm route POST /test-scenarios/:id/run proxy qua RmqProducer (dùng skill gateway:generate-controller, feature mới trong gateway theo đúng pattern proxy thuần — không service/repo ở gateway).
3. Backend — thống kê tổng hợp theo endpoint

Thêm method vào LogRepository (THIRD_SERVICE, src/features/log/log.repository.ts) — group theo (method, path):

casesPassed / casesTotal: join test_scenarios + test_runs (lần chạy mới nhất mỗi scenario).
calls24h: count(*) từ request_logs where serviceName='gateway' AND type='HTTP' AND path=... AND createdAt > now() - interval '24h'.
p95: percentile_cont(0.95) within group (order by duration_ms) (Drizzle sql template) trên cùng cửa sổ 24h.

Thêm RPC log.stats → gateway proxy GET /logs/stats.

4. Backend — realtime khi bấm "Chạy realtime"

Tận dụng nguyên log:new websocket có sẵn, không cần kênh mới:

FE gọi POST /test-scenarios/:id/run, backend trả ngay { correlationId } (không đợi full trace).
FE subscribe log:new (đã có useLogSocket), lọc client-side theo correlationId đang theo dõi → mỗi hop mới tới (gateway, rồi auth, rồi user, rồi Postgres...) đẩy dần vào panel "LIVE TRACE" theo đúng thứ tự thời gian thực, y như ảnh 2.
Khi hop gốc (gateway) trả response → gọi GET /logs/trace/:correlationId một lần cuối để lấy full waterfall chính xác, đối chiếu expectedStatus để hiện "Đạt/Lỗi".
5. Seed dữ liệu kịch bản mẫu

Viết script/migration seed test_scenarios cho các endpoint quan trọng (login, refresh, users/me, users/profile, classes, classes/members...) — mỗi endpoint 3-5 case như ảnh: "Request hợp lệ", "Thiếu/sai access token", "Body sai schema", case đặc thù domain (vd "SĐT sai định dạng"). Có thể tự-sinh một phần từ Zod schema hiện có trong gateway/src/packages/entities/* (field required → case "thiếu field", field format → case "sai định dạng").

6. Frontend — trang danh sách (mở rộng trang logger hiện có hoặc trang mới test-monitor)

Theo convention generate-page + rule structure-naming/api-integration:

lib/services/test-scenario.service.ts — useTestScenarioActions() gộp list/stats/run (theo mẫu api-integration.md).
components/test-monitor/ (tách file theo trách nhiệm — xem rule ui-components.md):
test-monitor-list.tsx: bảng nhóm theo endpoint (row cha) → click mở rộng hiện các case con (row có nút "Test" riêng), cột Case đạt, Gọi/24h, P95 lấy từ GET /logs/stats.
Chip filter service ở đầu trang (tái dùng SERVICE_STYLES/màu từ components/flow-requests/flow-request-data.ts cho nhất quán màu service).
Chip filter kết quả Tất cả/Lỗi/Chậm/Đạt (tái dùng logic categoryOf/resultToneOf đã có trong components/logger/logger-utils.ts).
7. Frontend — dialog chi tiết nâng cấp

Mở rộng RequestDetailDialog/request-detail-dialog.tsx hiện có (không viết lại từ đầu):

Thêm pipeline diagram ngang ở đầu dialog (CLIENT → Gateway → service → service → DB), tái dùng cách vẽ SVG node/edge đã có trong flow-request-diagram.tsx nhưng rút gọn thành dạng ngang, tô theo trạng thái OK/lỗi từng hop (dùng serviceColorOf/nodeStatusTone có sẵn).
Panel "LIVE TRACE" dạng log cuộn — render danh sách dòng text từ các log:new event vừa nhận (mô phỏng đúng format → Auth Service · gRPC ... trong ảnh).
Nút "Sao chép cURL": build chuỗi cURL từ node.requestBody/headers đã có sẵn trong LoggerTraceNode.
Nút "Chạy realtime": gọi run(scenarioId) ở mục 4, tự chuyển dialog sang theo dõi correlationId mới.
8. Kiểm thử & tài liệu
Unit test repository (stats/p95 query), e2e test route run (THIRD_SERVICE, theo bun run test:e2e).
FE: test hook useTestScenarioActions, test render list/dialog (Vitest, theo test/ mirror convention).
Cập nhật API_ENDPOINTS.md (gateway) + PAGES.md/API_ENDPOINTS.md (TUTOR-UI) với route mới.
Cập nhật CLAUDE.md/rule liên quan nếu pattern mới lặp lại đủ nhiều để đáng ghi thành convention (hook Stop đã tự nhắc việc này).
Gợi ý thứ tự làm (MVP trước, active-test sau)
Giai đoạn	Nội dung	Vì sao ưu tiên
MVP	Mục 3 + 6 (bảng nhóm theo endpoint + Gọi/24h + P95)	Chỉ cần đọc request_logs sẵn có, không cần bảng mới, không cần cơ chế "chạy test" — ra được 80% giá trị list view của ảnh 1
V2	Mục 1, 2, 5 (test_scenarios/test_runs + engine chạy)	Đưa ra "Case đạt X/Y" và nút Test thật
V3	Mục 4, 7 (realtime run + pipeline diagram + cURL)	Hoàn thiện trải nghiệm ảnh 2

Bạn muốn bắt đầu triển khai từ giai đoạn nào — MVP (thống kê trên dữ liệu log sẵn có) hay đi thẳng vào việc thêm bảng test_scenarios?
