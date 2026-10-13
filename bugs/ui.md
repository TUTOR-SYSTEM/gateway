# Báo cáo bug: TUTOR-UI (`/home/haidangphan/Documents/tutor/ui`) - vòng 3

Phạm vi: `app/`, `components/`, `hooks/`, `lib/`, `zustand/`, `types/`. Đối chiếu hợp đồng với gateway `/home/haidangphan/Documents/tutor/gateway/src` (controller, DTO/schema, guard). Đối chiếu trạng thái với `reviews/round2/ui-review.md` (UI2-xx) và `reviews/ui-review.md` (UI-xx, round1).

Phương pháp: đọc code; script so sánh ~200 chuỗi endpoint trong UI với bảng route của gateway (127 route, trích từ decorator); kiểm tra zod strict bằng `zod@4.6.5` có sẵn trong `gateway/node_modules`; kiểm tra `atob` trên JWT payload bằng Node. Không chạy build/lint/test/tsc và không gọi API thật.

Ghi chú về mức "Đã xác minh": "Đã xác minh" = đã đọc đủ code bên UI và schema/route gateway tương ứng, kết luận dựa trên đối chiếu. "Chưa xác minh" = có phần chưa kiểm được (ghi rõ trong cột).

---

## 1. Tóm tắt

| Mức độ | Số lượng | Trong đó MỚI | CÒN TỒN TẠI (từ round2/round1) | ĐÃ SỬA |
|---|---|---|---|---|
| Critical | 0 | 0 | 0 | 0 |
| High | 12 | 4 | 8 | 0 |
| Medium | 16 | 4 | 12 | 0 |
| Low | 20 | 4 | 16 | 0 |
| **Tổng** | **48** | **12** | **36** | **0** |

- Không phát hiện XSS khai thác được (không có `dangerouslySetInnerHTML`/`innerHTML`; `href` lấy từ dữ liệu server chỉ có ở UI2-29 và `cls.location`, xem UI3-12/UI2-29).
- Không phát hiện lộ token trực tiếp ra ngoài phạm vi trình duyệt. Token nằm trong `localStorage` (cả hai nơi, xem UI3-21) và trong query string sau OAuth (UI3-35).
- Round2 đánh giá "ổn" cho payload `PUT /users` (settings) và `PUT /users` strict: đánh giá đó sai, xem UI3-01.
- Không có bug nào trong round2 được xác nhận đã sửa. Mọi mục round2 đều còn nguyên trong source hiện tại.
- Thay đổi mức độ so với round2: UI2-13 (atob/base64url) hạ từ Medium xuống Low vì JWT payload hiện tại chỉ chứa ASCII nên không tái hiện được (xem chi tiết).
- Round1 UI-19 (cookie `access_token` cho `redirectIfAuthenticated`) không nằm trong round2, nay vẫn còn: đưa vào như UI3-48.

---

## 2. Bảng bug

Chú thích cột "Trạng thái": MỚI = phát hiện vòng này. CÒN TỒN TẠI (UI2-xx) = còn từ round2 (mã cũ trong ngoặc). CÒN TỒN TẠI (UI-19) = còn từ round1.

| ID | Mức độ | Trạng thái | File:dòng | Mô tả ngắn | Cách tái hiện / kịch bản | Đã xác minh |
|---|---|---|---|---|---|---|
| UI3-01 | High | MỚI (round2 UI2-32 đánh giá sai) | `app/(app)/settings/page.tsx:808-812` | Lưu hồ sơ gửi `PUT /users` kèm `lastName, phone, subjects, description, address, district, province` ngoài schema `updateSelfSchema` (strict) | Mở Cài đặt, sửa bất kỳ trường nào, bấm lưu: luôn 422 "Unrecognized key(s)", toast "Cập nhật thất bại" | Đã xác minh (zod strict: `omit` giữ strict, `lastName` bị từ chối) |
| UI3-02 | High | MỚI | `lib/services/student.service.ts:69`; `app/(app)/students/page.tsx:199`; `components/classes/dialog/edit-class-dialog.tsx:186`; `components/fees/family-fees-page.tsx:65-68`; `app/(app)/settings/page.tsx:696-699` | Gọi `GET /students` (gateway chỉ `@Roles('ADMIN')`) từ màn hình TUTOR và PARENT | TUTOR mở "Học sinh" hoặc chọn học sinh khi sửa lớp: 403. PARENT mở Học phí gia đình: không lấy được danh sách con, trang trống | Đã xác minh (gateway `student.controller.ts:130-133`) |
| UI3-03 | High | MỚI | `components/students/add-student-dialog.tsx:36`; `types/student.types.ts:21-25` | Mặc định `parentRelationship = "MALE"` (không thuộc enum); option "Người giám hộ" = `OTHER` (enum gateway là `GUARDIAN`) | Thêm học sinh mà không đổi ô "Quan hệ" (mặc định) hoặc chọn "Người giám hộ": 422 | Đã xác minh (`student.schema.ts:18` enum `FATHER/MOTHER/GUARDIAN`) |
| UI3-04 | High | MỚI | `components/classes/components/curriculum-chapter-row.tsx:57, 74` | Liệt kê bài học: `GET /curriculum/lessons/by-curriculum/:id` và tạo bài học: `POST /lesson?curriculumId=&chapterId=`. Gateway không có route nào trong hai dạng này | Tab Giáo trình trong lớp: danh sách bài học lỗi 404; thêm bài học lỗi 404 | Đã xác minh (script đối chiếu route; `lesson.controller.ts` chỉ có `curriculum/lessons` CRUD, không có `/lesson`) |
| UI3-05 | Medium | MỚI | `components/classes/page/curriculum-page.tsx:50, 63` | Lấy danh sách chương bằng `GET /curriculum/${classId}` (truyền id lớp vào endpoint id giáo trình); xoá chương bằng `DELETE /curriculum/${chapterId}` (đúng là `/chapter/:id`) | Tab Giáo trình trong lớp: danh sách chương lỗi/rỗng; xoá chương gọi nhầm endpoint xoá giáo trình (gateway không có @Roles, có thể xoá giáo trình ngoài ý muốn nếu id trùng) | Đường dẫn: đã xác minh. Shape response `{curriculums}`: chưa xác minh |
| UI3-06 | Medium | MỚI | `app/(app)/settings/page.tsx:792` | "Xoá ảnh" gửi `PUT /users {avatar: null}`; `updateSelfSchema` không có key `avatar` | Bấm "Xoá ảnh": 422, toast "Xoá ảnh thất bại" | Đã xác minh |
| UI3-07 | Medium | MỚI (chưa rõ spec) | `components/fees/fees-page.tsx:98`; `components/layout/app-sidebar.tsx:81` | `canCreate` cố định `true` cho TUTOR, trong khi chú thích sidebar ghi "view-only for Tutor" | TUTOR thấy nút tạo học phí. Gateway `tuition.controller.ts` không có @Roles nên API cũng cho mọi role tạo | Đã xác minh (code). Quy định nào đúng: chưa xác minh (không có tài liệu RBAC cho học phí) |
| UI3-08 | Medium | MỚI | `components/sessions/session-detail-view.tsx:83-86, 421-422, 668-670` | Dữ liệu mẫu hard-code: ghi chú riêng "Trọng tâm: kỹ thuật đổi biến…" hiển thị cho TUTOR như ghi chú thật; tên gia sư fallback "Thầy Minh" khi `get-by-field` lỗi | TUTOR mở chi tiết buổi học: thấy ghi chú giả. STUDENT/PARENT: `get-by-field` 403 nên thấy tên "Thầy Minh" | Đã xác minh |
| UI3-09 | Low | MỚI | `app/(app)/{accounts,budgets,categories,investments,transactions,analytics}/page.tsx`; `components/categories/*`; `components/transactions/transactions.data.ts`; `hooks/useQuery.hook.ts:24-119` (export qua `hooks/index.ts:9`) | Code tài chính cũ: gọi `/categories`, `/transactions`, `/wallets`, `/items/...` (không có ở gateway). Không khai báo trong `ROUTE_ACCESS` nên mọi role vào được bằng URL | Gõ `/categories` khi đăng nhập bất kỳ role: trang gọi endpoint 404 | Đã xác minh |
| UI3-10 | Low | MỚI | `app/(flow)/flow-request/page.tsx`, `app/(app)/api-gaps/page.tsx`, `lib/rbac/route-access.ts` (thiếu `/reports`) | Trang nội bộ/dev mở cho mọi role: `(flow)` lộ bản đồ API nội bộ (`flow-request.data.ts`), `api-gaps` lộ báo cáo gap. `/reports` không có trong ROUTE_ACCESS, chỉ ẩn nội dung bằng `isAdmin` trong component | STUDENT gõ `/flow-request` hoặc `/api-gaps`: vào được (`/flow-requests` thì đã bị ADMIN-only chặn) | Đã xác minh |
| UI3-11 | Low | MỚI | `app/(app)/practice-exams/*`, `components/practice-exams/*` | Gọi `/practice-exams`, `/practice-exams/:id`, `/practice-exams/:id/result` không có ở gateway. Không có trong sidebar | Vào `/practice-exams`: lỗi 404 | Đã xác minh |
| UI3-12 | Low | MỚI | `app/(app)/schedule/page.tsx:415-416`; `index.ts` (gốc repo) | `console.log` debug dữ liệu buổi học trong code production; file `index.ts` ở gốc chỉ có `console.log("Hello via Bun!")` | Mở Lịch, xem console | Đã xác minh |
| UI3-13 | High | CÒN TỒN TẠI (UI2-01) | `components/schedule/schedule-form-dialog.tsx:133-145` | Tạo buổi học từ trang Lịch gửi `{classId,title,date,startTime,endTime,...}`; `startAt/endAt` tính nhưng không gửi; thiếu `sessionNumber` | Trang Lịch → Thêm buổi học: 422 (`startAt`, `endAt`, `sessionNumber` bắt buộc) | Đã xác minh (`session.schema.ts:23-40`) |
| UI3-14 | High | CÒN TỒN TẠI (UI2-02) | `components/schedule/schedule-form-dialog.tsx:146-148` | Sửa buổi học gửi `date/startTime/endTime`; `updateSessionSchema` (không strict) bỏ qua | Sửa giờ: báo thành công, giờ không đổi | Đã xác minh (`session.schema.ts:68-86`) |
| UI3-15 | High | CÒN TỒN TẠI (UI2-03) | `components/sessions/session-detail-view.tsx:281, 393` | `axiosInstance.patch('/sessions/:id')`; gateway chỉ `@Put(':id')` | Đổi trạng thái buổi học / giao bài: 404 | Đã xác minh (`session.controller.ts:104`) |
| UI3-16 | High | CÒN TỒN TẠI (UI2-04) | `components/providers/socket.provider.tsx:35-79, 82` | Effect `[]` đọc token một lần lúc mount; `AuthProvider` rehydrate sau effect con nên token thường là `null`, `return` sớm. `value` đọc ref lúc render | Đăng nhập xong (SPA) không có socket; `isConnected` luôn false | Đã xác minh (thứ tự effect: con chạy trước cha) |
| UI3-17 | High | CÒN TỒN TẠI (UI2-05) | `hooks/useChat.hook.ts:49-149`; `socket.provider.tsx:39`; `components/discussions/discussions-page.tsx:218` | `/chat/*` REST và socket namespace `/chat` gọi vào gateway (8888); gateway không có controller chat, `ChatGateway` nằm ở tutor-service | Trang Thảo luận: toàn bộ query 404, không có realtime | Đã xác minh (không có `chat` trong route gateway; `tutor-service/src/features/chat/chat.gateway.ts`) |
| UI3-18 | High | CÒN TỒN TẠI (UI2-06) | `components/layout/app-sidebar.tsx:196-199`; `components/providers/query.provider.tsx:9-22` | Đăng xuất chỉ `setAccessToken(null)` + `router.push('/login')`; không `queryClient.clear()`; query key không chứa userId | User A đăng xuất, User B đăng nhập trong cùng tab (SPA): thấy cache của A (`["classes"]`, `["students"]`, `["notifications"]`...) trong khoảng `staleTime`/`gcTime` | Đã xác minh (không có `queryClient.clear|removeQueries|resetQueries` trong toàn source) |
| UI3-19 | High | CÒN TỒN TẠI (UI2-07) | `components/users/create-user-dialog.tsx:71-72, 96-102`; `types/user.types.ts:84-90` | `POST /users` không có `password`; `createUserSchema` bắt buộc 8–20 ký tự; UI chỉ kiểm tra rỗng cho `firstName/lastName` (schema yêu cầu tối thiểu 2 ký tự) | ADMIN tạo người dùng từ `/users`: 422 | Đã xác minh (`user.schema.ts:222-250`) |
| UI3-20 | High | CÒN TỒN TẠI (UI2-08), mở rộng | `components/users/edit-user-dialog.tsx:115-121`; `lib/services/user.service.ts:132-135` | `PUT /users/:id` gửi `{id, firstName, lastName, phone, role}`. `updateUserSchema` là `.strict()` và không có `id`, `lastName`, `phone`, `role` | ADMIN sửa người dùng: 422 "Unrecognized key(s)". Vì `role` cũng bị từ chối, không đổi được vai trò qua endpoint này | Đã xác minh (`user.schema.ts:124-207`, `user.controller.ts:175-186`) |
| UI3-21 | Medium | CÒN TỒN TẠI (UI2-09) | `lib/axios/client.ts:117, 155-156`; `lib/axios/refresh-access-token.ts:21-24`; `zustand/auth.store.ts:59-66` | Token lưu hai nơi (zustand `auth-store` và key `accessToken/refreshToken`). `clearAuth()` không xoá key cũ; nhánh 401 và refresh lỗi không gọi `clearAuthTokens()`; request interceptor fallback sang `getAccessToken()` | Refresh lỗi rồi redirect `/login`: `localStorage.accessToken` cũ vẫn còn và vẫn được gắn vào request | Đã xác minh (đọc code) |
| UI3-22 | Medium | CÒN TỒN TẠI (UI2-10) | `lib/axios/refresh-access-token.ts:21-24` | `catch {}` nuốt mọi lỗi (mất mạng, 5xx) rồi `clearAuth()` và trả false | Mạng chập chờn đúng lúc token hết hạn: bị đăng xuất dù refresh token còn hạn | Đã xác minh |
| UI3-23 | Medium | CÒN TỒN TẠI (UI2-11) | `components/providers/auth.provider.tsx:125-147` (gọi ở dòng 131, `setCredentials` dòng 135) | Sau 401 của `/users/detail-user`, provider gọi `postAuthRefresh(refreshToken)` với refresh token trong closure, không single-flight, không `saveAuthTokens` | Refresh token đã bị xoay bởi interceptor được dùng lại; localStorage không cập nhật | Đã xác minh |
| UI3-24 | Medium | CÒN TỒN TẠI (UI2-12) | `components/providers/auth.provider.tsx:97, 156-164` | Effect phụ thuộc `accessToken`, `refreshToken`; mỗi lần refresh chạy lại `setSessionChecked(false)` và gọi lại profile | `isAuthenticated` chớp false, request thừa sau mỗi refresh | Đã xác minh |
| UI3-25 | Low (hạ từ Medium) | CÒN TỒN TẠI (UI2-13) | `hooks/useCurrentUserId.ts:16`; `hooks/useCurrentUserRole.ts:25, 43` | `atob()` trên payload JWT không xử lý base64url và UTF-8; fallback role = `"TUTOR"` | JWT hiện tại (`sub,email,typ,role,iat,exp`) không có `-`/`_` nên không lỗi trong thực tế. Chỉ lỗi nếu email chứa ký tự non-ASCII làm sinh `-`/`_`/`>`/`?`/`~`. Fallback TUTOR vẫn có thể hiện UI gia sư nếu JWT không đọc được | Đã xác minh (Node: 200/200 payload ASCII decode được, không có `-`/`_`) |
| UI3-26 | Medium | CÒN TỒN TẠI (UI2-14) | `app/(app)/settings/page.tsx:767, 1573`; `lib/services/user.service.ts:35, 53, 111, 121` | `POST /users/avatar`, `PUT /users/grade`, `GET /curriculum/grades`, `GET /users/grades` không có route. `/users/grade` khớp `PUT /users/:id` với id `grade`. `useUserActions()` gọi `/curriculum/grades` và `/users/grades` không điều kiện ở Cài đặt và Điểm số | Tải ảnh đại diện: lỗi. Chọn khối lớp: lỗi. Mở Cài đặt và Điểm số: 2 request 404 | Đã xác minh (script đối chiếu route) |
| UI3-27 | Medium | CÒN TỒN TẠI (UI2-15) | `components/curriculum/components/lesson-row.tsx:42-63`; `components/classes/components/curriculum-lesson-row.tsx:51, 71`; `lib/services/lesson.service.ts:29-30` | Upload/xoá tài liệu bài học gọi `/curriculum/lessons/:id/add-theory`, `/exercises`, `DELETE /lesson/:id/...`: không có route | Thêm/xoá lý thuyết hoặc bài tập của bài học: 404 | Đã xác minh |
| UI3-28 | Medium | CÒN TỒN TẠI (UI2-16) | `components/grades/grades-page.tsx:484` | `GET /curriculum/by-grade/:gradeId` không có route | Mở rộng khối lớp trong Điểm số: 404 hoặc rỗng | Đã xác minh |
| UI3-29 | Medium | CÒN TỒN TẠI (UI2-17) | `components/classes/dialog/create-class-modal.tsx:311`; `components/students/add-student-dialog.tsx:120`; `components/students/edit-student-dialog.tsx:186-200` | Gửi `maxStudents` (lớp), `classCode` (tạo học sinh), `classId` (sửa học sinh). Schema lớp và học sinh không có các key này, schema học sinh không strict nên bị bỏ im lặng | Gán lớp cho học sinh (tạo hoặc sửa): báo thành công, không lưu | Đã xác minh (`student.schema.ts` không có `classId/classCode`) |
| UI3-30 | Medium | CÒN TỒN TẠI (UI2-18) | `components/classes/dialog/create-class-modal.tsx:304-345` | Tạo lớp rồi mới `createBulk` lịch. Lỗi bước 2: toast lỗi nhưng lớp đã có, không lưu `created.id` để retry | Bước lịch lỗi, bấm lại: trùng `code` (409) hoặc lớp không có lịch | Đã xác minh |
| UI3-31 | Medium | CÒN TỒN TẠI (UI2-19) | `app/(app)/settings/page.tsx:1070-1090` | Form đổi mật khẩu ép `currentPassword` đủ độ phức tạp (min 8, hoa, thường, số), còn `newPassword` không kiểm tra max 20 và ký tự đặc biệt | Mật khẩu cũ đơn giản: không đổi được. Mật khẩu mới thiếu ký tự đặc biệt hoặc dài 21+: 422 sau khi submit | Đã xác minh (`user.schema.ts:55-93`) |
| UI3-32 | Medium | CÒN TỒN TẠI (UI2-20) | `components/sessions/session-detail-view.tsx:414-419`; `components/classes/page/class-detail-watch-page.tsx:301-306`; `components/classes/page/exercise-submit-page.tsx:177-182`; `lib/services/user.service.ts:84-88` | `GET /users/get-by-field` chỉ ADMIN; STUDENT/PARENT/TUTOR dùng để tra tên gia sư | Học sinh/phụ huynh xem buổi học: 403 và hiển thị tên giả (xem UI3-08) | Đã xác minh (`user.controller.ts:101-104`) |
| UI3-33 | Medium | CÒN TỒN TẠI (UI2-21) | `lib/rbac/route-access.ts:30`; `components/curriculum/page/curriculum-list-page.tsx:229-294`; `components/curriculum/page/curriculum-detail-page.tsx`; `components/curriculum/components/lesson-row.tsx` | Trang Giáo trình cho PARENT (`/curriculum` TUTOR+PARENT) nhưng không kiểm tra role: có nút tạo/sửa/xoá chương và giáo trình. Gateway `curriculum.controller.ts` không có `@Roles` ở route ghi | PARENT thấy nút sửa/xoá. Nếu gateway siết quyền, mọi thao tác thành 403 | Đã xác minh (code UI và gateway) |
| UI3-34 | Low | CÒN TỒN TẠI (UI2-22) | `test/` | Không có test cho `lib/axios/client.ts` (refresh, retry 401), `refresh-access-token.ts`, `zustand/auth.store.ts`, `AuthProvider`, `SocketProvider`, form tạo/sửa người dùng, form lịch. Lỗi UI2-01..UI3-24 không bị CI bắt | Chạy `bun run test` (không chạy trong vòng này) | Đã xác minh (danh sách file test) |
| UI3-35 | Low | CÒN TỒN TẠI (UI2-23) | `components/auth/oauth-callback.tsx:24-25`; gateway `auth.controller.ts:274-300` | Access/refresh token đi qua query string `?accessToken&refreshToken` (gateway redirect); FE không xoá khỏi URL trước khi `router.replace('/')` | Token nằm trong log proxy/Referer của bước redirect | Đã xác minh |
| UI3-36 | Low | CÒN TỒN TẠI (UI2-24) | `components/auth/login-form.tsx:74-85` | Response thiếu token vẫn `router.replace("/")` không báo lỗi; form không validate rỗng phía client | Đăng nhập không có token: bị đẩy về `/login` im lặng | Đã xác minh |
| UI3-37 | Low | CÒN TỒN TẠI (UI2-25) | `components/fees/tuitions-board.tsx:85` | `YEARS = [2024..2027]` cố định | Từ 2028 không chọn được năm hiện tại | Đã xác minh |
| UI3-38 | Low | CÒN TỒN TẠI (UI2-26) | `lib/services/class.service.ts:71-77` | `generateCode` là `useGet` không có `enabled` mặc định | Mọi màn hình dùng `useClassActions()` gọi thêm `GET /classes/generate-code` | Đã xác minh |
| UI3-39 | Low | CÒN TỒN TẠI (UI2-27) | `app/(app)/settings/page.tsx:760` | `URL.createObjectURL(file)` không `revokeObjectURL` (các file khác có revoke) | Rò bộ nhớ nhỏ mỗi lần chọn ảnh | Đã xác minh |
| UI3-40 | Low | CÒN TỒN TẠI (UI2-28) | `components/sessions/student-session-detail.tsx:126-137`; `components/classes/components/exercise-grade-workspace.tsx:212-228` | Upload tuần tự; `setStaged` chỉ sau vòng lặp; lỗi giữa chừng bỏ cả file đã lên | File mồ côi trên R2; user phải chọn lại | Đã xác minh |
| UI3-41 | Low | CÒN TỒN TẠI (UI2-29) | `app/(app)/page.tsx:397`; `app/(app)/notifications/[id]/page.tsx:151-153` | `redirectUrl` từ server đưa vào `href` không kiểm tra scheme/host | Thông báo có URL ngoài: liên kết đi ra ngoài (React 19 chặn `javascript:`) | Đã xác minh |
| UI3-42 | Low | CÒN TỒN TẠI (UI2-30) | `components/users/users-page.tsx:175`; gateway `user.controller.ts:212-214` | UI gửi `isActive` mong muốn nhưng `PUT /users/:id/status` bỏ qua body và tự lật trạng thái | Hai thao tác gần nhau: lật ngược ý định; dialog xác nhận dựa trên state cũ | Đã xác minh |
| UI3-43 | Low | CÒN TỒN TẠI (UI2-31) | `components/tutors/add-tutor-dialog.tsx:151` | Hint "8–14 ký tự" sai: `createManagedUserSchema` là 8–20 và có quy tắc hoa/thường/số/ký tự đặc biệt | ADMIN nhập 15–20 ký tự thấy hint sai; thiếu ký tự đặc biệt chỉ biết khi 422 | Đã xác minh (`admin.schema.ts:44-84`) |
| UI3-44 | Low | CÒN TỒN TẠI (UI2-32) | `app/(app)/settings/page.tsx:776, 799, 825` | Lỗi avatar/hồ sơ dùng `alert()` chuỗi cố định, bỏ message 422 của server | Lưu hồ sơ lỗi chỉ thấy "Cập nhật thất bại" (xem thêm UI3-01) | Đã xác minh |
| UI3-45 | Low | CÒN TỒN TẠI (UI2-33) | `hooks/useLogSocket.hook.ts:30-37`; `components/providers/socket.provider.tsx:37-44` | Token đọc một lần khi tạo socket; reconnect sau khi access token hết hạn (3h) dùng token cũ | Socket log/chat reconnect bị từ chối sau 3h | Đã xác minh |
| UI3-46 | Low | CÒN TỒN TẠI (UI2-34) | `components/auth/login-form.tsx:79-83`; `lib/axios/auth-storage.ts` | `setAuthTokens` (store) đã lưu localStorage; `saveAuthTokens` gọi lại thừa. Khi response không có refresh token, `setCredentials` giữ refresh token cũ của phiên trước | Đăng nhập tài khoản khác không trả refresh token: vẫn mang refresh token người trước | Đã xác minh |
| UI3-47 | Low | CÒN TỒN TẠI (UI2-35) | `lib/services/notification.service.ts:79-82`; `lib/services/user.service.ts:34-67`; `lib/services/lesson.service.ts` | Mã chết hoặc trỏ route không tồn tại: `notification.create` (POST /notifications chỉ ADMIN/TUTOR), `apiUploadAvatar`, `apiUpdateProfile`, `apiUpdateUserGrades`, `apiUploadLessonFile` | Dễ bị dùng lại gây 403/404 | Đã xác minh (đối chiếu route) |
| UI3-48 | Low | CÒN TỒN TẠI (UI-19, round1) | `lib/axios/auth-redirect.ts:5-12` | `redirectIfAuthenticated` kiểm tra cookie `access_token`/`accessToken`, nhưng app không bao giờ set cookie (chỉ dùng localStorage) | Guard server-side ở `login/register/reset-password` vô hiệu; chỉ còn guard client | Đã xác minh (không có `document.cookie` hay set cookie ở đâu) |

---

## 3. Chi tiết từng bug

Mỗi mục chỉ ghi phần chưa có trong bảng: bằng chứng đối chiếu và hướng sửa.

### UI3-01 - Lưu hồ sơ luôn 422
- Bằng chứng: `handleProfileSave` (settings:806-812) gửi `{firstName,lastName,email,phone,subjects,description,address,district,province}` (trừ phần name khi đã khoá). Gateway `PUT /users` dùng `updateSelfSchema = updateUserSchema.omit({...})` (`user.schema.ts:214`), còn `updateUserSchema` `.strict()` (`:207`) chỉ có `email, username, firstName, classId, gradesId, parentId, tutorId`. Đã thử zod 4.6.5: `omit` vẫn strict, `lastName` bị báo "Unrecognized key".
- Hướng sửa: chỉ gửi các key trong schema, hoặc mở rộng `updateSelfSchema` theo cột DB thật (cần quyết định phía backend).

### UI3-02 - `GET /students` chỉ ADMIN
- Bằng chứng: `student.controller.ts:130` `@Roles('ADMIN')` trên `@Get()` (dòng 132-133). `GET /students/:id` (dòng 167) cho ADMIN, TUTOR.
- Kịch bản: TUTOR (`ROUTE_ACCESS` cho `/students` là ADMIN+TUTOR, sidebar có mục này) nhận 403. PARENT (`family-fees-page`, `settings` mục liên kết con) cũng 403.
- Hướng sửa: hoặc gateway mở `GET /students` cho TUTOR (có scope), hoặc UI đổi sang endpoint đúng vai trò. Cần quyết định; hiện UI và gateway không khớp.

### UI3-03 - Quan hệ phụ huynh mặc định sai
- Bằng chứng: `add-student-dialog.tsx:36` `parentRelationship: GENDER_ENUM.MALE`. `RELATIONSHIP_OPTIONS` (`types/student.types.ts:21-25`) có `FATHER, MOTHER, OTHER`. Gateway `createStudentSchema` (`student.schema.ts:18`) chỉ nhận `FATHER, MOTHER, GUARDIAN`.
- Hướng sửa: mặc định `""` (undefined) và đổi `OTHER` thành `GUARDIAN`. `edit-student-dialog.tsx` đã dùng đúng enum.

### UI3-04 - Bài học trong lớp dùng route không tồn tại
- Bằng chứng: script đối chiếu: `/curriculum/lessons/by-curriculum/:p` và `/lesson` không có trong route gateway. `curriculum-chapter-row.tsx:57` là `useGet` (chạy khi mở chương), `:74` là `axiosInstance.post`.
- Hướng sửa: dùng `GET /curriculum/lessons?curriculumId=&chapterId=` (đã có ở `lesson.controller.ts:60`) và `POST /curriculum/lessons`. Lưu ý comment trong code: hai query param đang cùng dùng `chapter.id`.

### UI3-05 - Tab giáo trình trong lớp
- Bằng chứng: `curriculum-page.tsx:50` `/curriculum/${classId}` (`GET /curriculum/:id` là id giáo trình). `:63` `axiosInstance.delete('/curriculum/${chapterId}')` (xoá chương phải là `DELETE /chapter/:id`, `chapter.controller.ts:98`). Hình dạng `{curriculums: Chapter[]}` chưa đối chiếu được với response gateway.

### UI3-06 - Xoá ảnh đại diện
- Bằng chứng: `settings:787-792` gửi `{avatar: null}` tới `PUT /users`; `updateSelfSchema` không có `avatar` và `.strict()`. Cùng nhóm với UI3-26 (upload avatar không có route).

### UI3-07 - Nút tạo học phí cho TUTOR
- Bằng chứng: `fees-page.tsx:98` `canCreate` (không điều kiện). Sidebar `app-sidebar.tsx:81` ghi "view-only for Tutor". `tuition.controller.ts` không có `@Roles` ở `POST`, `PUT`, `DELETE`.
- Ghi chú: cần xác định spec. Nếu TUTOR được tạo học phí thì comment sidebar sai; nếu không thì UI và gateway đều sai.

### UI3-08 - Dữ liệu mẫu hiển thị như thật
- Bằng chứng: `session-detail-view.tsx:83-86` `SAMPLE`. Dòng 421-422 fallback `SAMPLE.tutorName`. Dòng 668-670 render `SAMPLE.privateNote` trong khối "Ghi chú riêng" (chỉ khi `view === "TUTOR"`, dòng 613).
- Hướng sửa: xoá dữ liệu mẫu khỏi production hoặc đặt sau cờ dev; khối ghi chú riêng cần dữ liệu thật hoặc ẩn.

### UI3-09 - Code tài chính cũ
- Bằng chứng: `hooks/index.ts:9` export `useQuery.hook.ts`, trong đó có `/transactions`, `/items/:id/activate`. Các trang `accounts, budgets, categories, investments, transactions, analytics` không có trong `NAV` và không có trong `ROUTE_ACCESS`.
- Hướng sửa: xoá hoặc khai báo role.

### UI3-10 - Trang nội bộ mở cho mọi role
- Bằng chứng: `app/(flow)/layout.tsx` chỉ dùng `RouteAccessGuard`; `/flow-request` không có trong `ROUTE_ACCESS` nên `ALL_ROLES`. `app/flow-requests/layout.tsx` (ADMIN) đã đúng, nhưng `(flow)` là một bản khác. `/api-gaps` không khai báo.
- `/reports` không có trong `ROUTE_ACCESS`; `reports-page.tsx:63-111` tự ẩn bằng `isAdmin`. Rule `fe-rbac-role-guarding.md` yêu cầu khai báo cả hai nơi.

### UI3-11 - Practice exams
- Bằng chứng: `practice-exams-page.tsx:162`, `practice-exam-take-page.tsx:138`, `practice-exam-result-page.tsx:145`. Gateway không có controller practice.

### UI3-12 - Debug và file thừa
- Bằng chứng: `schedule/page.tsx:415-416`; `index.ts` ở gốc `ui/` chứa `console.log("Hello via Bun!")`.

### UI3-13 đến UI3-20
- Chi tiết contract đã nêu trong bảng. Ghi thêm: UI3-19 và UI3-20 cùng nhóm `/users`. `createUserSchema` (`user.schema.ts:222`) có `role` mặc định `STUDENT`, nên `role` được nhận. Phần thiếu chỉ là `password`.

### UI3-21 - Token lưu hai nơi
- Bằng chứng: `auth-storage.ts` (key `accessToken`, `refreshToken` trong localStorage). `zustand/auth.store.ts:76-87` persist `auth-store` (partialize chỉ token). `clearAuth()` (dòng 59-66) đưa store về `null`, nhưng không gọi `clearAuthTokens()`. `client.ts:117` fallback `useAuthStore.getState().accessToken || getAccessToken()`. Chỉ `setAccessToken(null)` (sidebar logout) mới gọi `clearAuthTokens()`.

### UI3-22 đến UI3-24
- Chi tiết như bảng. `refreshAccessTokenViaStore` (`refresh-access-token.ts:28-35`) đã single-flight. `auth.provider.tsx:131` không dùng hàm này, nên UI3-23 là lệch so với cơ chế đã có.

### UI3-25 - atob
- Kiểm tra: Node, 200 payload JWT dạng `{sub,role,iat,exp,email}` ASCII, không có `-`/`_` nào, decode thành công. Payload thật (`user/src/packages/helpers/jwt.helper.ts`) cũng chỉ có `sub,email,typ,role,iat,exp`. Vì vậy rủi ro thực tế thấp; giữ để sửa cho đúng chuẩn base64url.

### UI3-26 - Avatar, khối lớp
- Gateway `user.controller.ts` không có `POST /users/avatar`, `GET /users/grades`, `PUT /users/grade`, `GET /curriculum/grades` (kiểm tra bằng script). `useUserActions()` (`user.service.ts:111, 121`) không có `enabled` mặc định `false`, nên mỗi lần gọi hook (Cài đặt, Điểm số) bắn hai request 404.

### UI3-27 đến UI3-30
- Chi tiết như bảng. UI3-29: `student.schema.ts` không có `classId`/`classCode`; `create-class-modal.tsx:311` gửi `maxStudents`, `createClassSchema` không có key này (không strict nên bị bỏ).

### UI3-31 - Mật khẩu
- Gateway `changePasswordSchema` (`user.schema.ts:55-93`): `currentPassword` chỉ `min(1)`; `newPassword` min 8, max 20, cần hoa/thường/số/ký tự đặc biệt. UI (`settings:1070-1090`) lệch cả hai phía.

### UI3-32 - get-by-field
- Gateway `user.controller.ts:101-104`: `@Roles('ADMIN')`. Ba màn hình UI gọi cho mọi role. Xem thêm UI3-08 về fallback tên giả.

### UI3-33 - Giáo trình cho PARENT
- Gateway `curriculum.controller.ts` không có `@Roles` ở `POST/PUT/DELETE` (dòng 43, 93, 118). Nếu sau này gateway siết quyền đúng với UI (chỉ ADMIN/TUTOR), UI cần ẩn nút cho PARENT ngay.

### UI3-34 đến UI3-48
- Đã nêu đầy đủ trong bảng. Các mục Low có tác động nhỏ, không cần chi tiết thêm.

---

## 4. Ghi chú ngoài phạm vi UI (ảnh hưởng đến việc kiểm chứng)

- Gateway có marker merge chưa giải quyết (`<<<<<<< `) trong 9 file: `src/features/user/user.controller.ts`, `src/features/redis/redis.controller.ts`, `src/features/notification/notification.controller.ts`, `src/packages/guards/jwt-auth.guard.ts`, `src/features/student/student.controller.ts`, `src/features/upload/upload.controller.ts`, `src/features/admin/admin.controller.ts`, và 2 file test trong `test/packages/guards/`. Gateway không build được ở trạng thái này. Đối chiếu trong báo cáo dựa trên nội dung file trên đĩa.
- Gateway thiếu `@Roles` trên nhiều route ghi: `class`, `session`, `schedule`, `curriculum`, `tuition`, `attendance`, `exercise` (và `POST /students`). Ẩn nút ở UI không phải ràng buộc thật. Đây là lỗ hổng phân quyền phía backend, cần xử lý ở gateway.
- Quyết định cần có: `GET /students` cho TUTOR/PARENT (UI3-02) và `POST /users` có cần `password` từ UI không (UI3-19).

## 5. Không kiểm chứng trong vòng này

- Không chạy `bun run typecheck/lint/test`, không chạy app, không gọi API thật.
- Chưa kiểm chi tiết các form phụ (`exercise-grade-workspace`, `session-detail-page` gọi `/classes/.../submissions`, `test-monitor`, `logger`) ngoài các điểm đã nêu.
