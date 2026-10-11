# Review: ui

## Tổng quan

- **Scope**: `D:\projects\ui` (Next.js 16 / React 19, axios + React Query + zustand). Đối chiếu với gateway (`D:\projects\gateway\src`), user service và `API_ENDPOINTS.md`.
- **Đã đọc kỹ**: toàn bộ `lib/axios/*`, `zustand/*`, `components/providers/*`, `hooks/` (auth, socket, chat, live trace), `lib/services/*` (so path/method với controller gateway), `components/auth/*`, `lib/rbac/*`, và các điểm nóng trong `schedule-form-dialog`, `session-detail-view`, `create-class-modal`, `exercise-submit-page`, `settings/page`, `tuitions-board`, `notifications`, dialog `students`.
- **Chưa đọc hết** (~64k LOC): các page lớn (`grades-page`, `session-detail-page`, `transactions`...) chỉ kiểm tra bằng grep các pattern rủi ro (timer, listener, blob URL, `dangerouslySetInnerHTML`; không tìm thấy `dangerouslySetInnerHTML`/`innerHTML` nào).
- **Đánh giá chung**: lớp auth/refresh thiết kế khá tốt (single-flight refresh, cờ `_retry401`, bỏ qua refresh cho endpoint auth, `skipHydration` tránh mismatch SSR). Lỗi nghiêm trọng tập trung ở (1) tích hợp backend (route không tồn tại / payload sai schema), (2) socket không bao giờ kết nối, (3) vệ sinh phiên khi đăng xuất/hết hạn (cache React Query, token lưu trùng lặp trong localStorage).
- Lưu ý: `lib/api-gaps/gap-report.json` đã **lỗi thời** ở một số mục (students, tutors, route-order lesson). Các mục dưới đây đều đã đối chiếu lại trực tiếp với code gateway hiện tại.

## Thống kê

| Severity | Số lượng |
|---|---|
| Critical | 0 |
| High | 6 |
| Medium | 12 |
| Low | 8 |

## Danh sách bug

| ID | Severity | File:line | Mô tả | Kịch bản lỗi | Đề xuất sửa |
|---|---|---|---|---|---|
| UI-01 | High | `components/providers/socket.provider.tsx:35-37,79` | `useEffect` deps `[]` đọc token một lần lúc mount root; không bao giờ kết nối lại sau hydrate/login | Provider mount ở root layout, effect con chạy trước effect rehydrate của `AuthProvider` nên token `null` và `return`. Đăng nhập xong vẫn không có socket: `isConnected` luôn false, presence/chat realtime chết | Subscribe `accessToken` từ `useAuthStore` và đưa vào deps; dùng `auth: (cb) => cb({token: store.getState().accessToken})` để reconnect lấy token mới |
| UI-02 | High | `components/schedule/schedule-form-dialog.tsx:128-161`, `types/session.types.ts:84` | `POST /sessions` gửi `{date,startTime,endTime}`; gateway `createSessionSchema` yêu cầu `startAt`, `endAt`, `sessionNumber` (>=1). `startAt/endAt` đã tính (dòng 130-131) nhưng không đưa vào payload | Tạo buổi học từ trang Lịch nhận 422 "Start time must be a valid date" / "Session number must be >= 1" | Gửi `startAt`, `endAt`, `sessionNumber`; bỏ `date/startTime/endTime` |
| UI-03 | High | `components/schedule/schedule-form-dialog.tsx:147` | `PUT /sessions/:id` gửi `date/startTime/endTime`; `updateSessionSchema` không có các field này nên bị strip im lặng | Sửa giờ buổi học báo thành công nhưng giờ không đổi | Gửi `startAt/endAt` |
| UI-04 | High | `components/sessions/session-detail-view.tsx:281,393` | Dùng `axiosInstance.patch('/sessions/:id')`; gateway chỉ có `PUT /sessions/:id` (`session.controller.ts:104`) | Đổi trạng thái buổi học và "import tài liệu / giao bài" nhận 404 | Đổi sang PUT (schema update đều optional) |
| UI-05 | High | `components/providers/auth.provider.tsx:42-43,101-102`; `zustand/auth.store.ts:59`; `lib/axios/client.ts:117,155`; `lib/axios/refresh-access-token.ts:22` | Token lưu **hai nơi**: `auth-store` (zustand persist) và key `accessToken`/`refreshToken` (auth-storage). `clearAuth()` chỉ xóa store; interceptor 401 (`client.ts:155`) và `performRefresh` (dòng 22) không gọi `clearAuthTokens()`. Request interceptor fallback `store.accessToken \|\| getAccessToken()` | Refresh hỏng: store sạch nhưng localStorage còn token cũ/hết hạn vẫn bị gắn `Authorization`; refresh token cũ còn nằm trong localStorage | Gom về một kho (bỏ auth-storage) hoặc cho `clearAuth` gọi `clearAuthTokens`; bỏ fallback `getAccessToken()` |
| UI-06 | High | `components/layout/app-sidebar.tsx:196-199`; `components/providers/query.provider.tsx:7` | Đăng xuất chỉ `setAccessToken(null)`; không `queryClient.clear()` | User A đăng xuất, user B đăng nhập cùng tab (điều hướng SPA) trong 5 phút `gcTime`/30s `staleTime` thấy dữ liệu cache của A (`["classes"]`, `["students"]`, `["notifications"]`...). Query key không gắn user id | Gọi `queryClient.clear()` khi signOut/login; hoặc `window.location.assign("/login")` |
| UI-07 | Medium | `lib/axios/refresh-access-token.ts:21-24` | `catch {}` nuốt mọi lỗi (mất mạng, timeout, 5xx) rồi `clearAuth()` + trả false, interceptor `redirectToLogin()` | Mạng chập chờn đúng lúc access token hết hạn khiến user bị đăng xuất cưỡng bức dù refresh token còn hạn | Chỉ clear khi refresh trả 400/401; lỗi mạng/5xx thì reject mà giữ phiên |
| UI-08 | Medium | `components/providers/auth.provider.tsx:125-147` | Sau khi `GET /users/detail-user` trả 401 (interceptor đã refresh một lần và xoay refresh token), provider lại gọi `postAuthRefresh(refreshToken)` với `refreshToken` **cũ trong closure**, không single-flight; sau refresh không `saveAuthTokens` | Dùng lại refresh token đã bị xoay: server có thể coi là reuse/revoke; localStorage legacy giữ token cũ | Dùng `refreshAccessTokenViaStore()`; đọc token từ `getState()` |
| UI-09 | Medium | `components/providers/auth.provider.tsx:89-163` | Effect phụ thuộc `accessToken`,`refreshToken`; mỗi lần interceptor refresh làm token đổi thì `setSessionChecked(false)` rồi gọi lại `/users/detail-user` | `isAuthenticated` chớp false giữa chừng; request thừa sau mỗi lần refresh | Chỉ verify khi hydrate xong / đổi phiên, không phụ thuộc token đã refresh |
| UI-10 | Medium | `hooks/useCurrentUserId.ts:25`, `hooks/useCurrentUserRole.ts:56` | `atob()` trên payload JWT là base64**url** (`-`,`_`) và UTF-8, có thể throw và trả `null` | `useCurrentUserId` null khiến tạo lớp (`create-class-modal.tsx:295`) và nộp bài báo "Thiếu thông tin"; role rơi về mặc định `"TUTOR"` nên STUDENT/PARENT có thể thấy UI gia sư đến khi profile load. **Cần xác minh** tần suất với token thật | Chuẩn hóa `replace(/-/g,'+').replace(/_/g,'/')` + decode UTF-8; không mặc định role `TUTOR` |
| UI-11 | High | `hooks/useChat.hook.ts:49,71,84,117,149`; `hooks/useChatSocket.hook.ts`; `socket.provider.tsx:39` | Toàn bộ `/chat/*` REST không có controller ở gateway (danh sách `@Controller` của gateway không có `chat`); namespace socket `/chat` nằm ở tutor-service port riêng nhưng UI trỏ vào `NEXT_PUBLIC_API_URL` (gateway) | Trang Discussions: mọi query 404, không tải được hội thoại, tin nhắn, người dùng chat | Thêm proxy ở gateway hoặc cấu hình URL riêng tới tutor-service |
| UI-12 | Medium | `app/(app)/settings/page.tsx:767,1573`; `lib/services/user.service.ts:35,53,111,121` | `POST /users/avatar`, `GET /users/grades`, `GET /curriculum/grades`, `PUT /users/grade` không có route. `/users/grade` khớp `PUT /users/:id` với id="grade" (lỗi uuid); `/curriculum/grades` rơi vào `GET /curriculum/:id` | Upload avatar và chọn khối lớp trong Settings luôn lỗi | Thêm route backend hoặc dùng `POST /upload` + `PUT /users {avatar, gradesId}` |
| UI-13 | Medium | `components/classes/components/curriculum-lesson-row.tsx:51,71`; `components/curriculum/components/lesson-row.tsx:43,63`; `lib/services/lesson.service.ts:29-30` | Upload/xóa file bài học gọi `/curriculum/lessons/:id/theory`, `/add-theory`, `/exercises` (không tồn tại; lesson controller chỉ CRUD) và `DELETE /lesson/:id/...` (sai tiền tố, gateway là `curriculum/lessons`) | Tải/xóa tài liệu lý thuyết/bài tập trong giáo trình nhận 404 | Dùng `POST /upload` rồi `PUT /curriculum/lessons/:id` với `theoryUrls/exerciseUrls` |
| UI-14 | Medium | `components/grades/grades-page.tsx:484` | `GET /curriculum/by-grade/:gradeId` không có route | Mở rộng khối lớp trong trang Grades nhận 404 / danh sách rỗng | Thêm route hoặc filter `GET /curriculum?gradeId=` |
| UI-15 | Medium | `components/classes/dialog/create-class-modal.tsx:310`; `components/students/add-student-dialog.tsx:114`; `components/students/edit-student-dialog.tsx:196` | Gửi `maxStudents`, `classCode`, `classId`; không có trong schema gateway (non-strict nên bị bỏ im lặng) | Chọn lớp 1-1/nhóm, gán lớp cho học sinh khi tạo/sửa: báo thành công nhưng không lưu | Bổ sung field vào schema/DB hoặc dùng `POST /classes/:id/students` |
| UI-16 | Medium | `components/classes/dialog/create-class-modal.tsx:304-345` | Tạo lớp rồi mới tạo schedule bulk; không rollback/retry nếu bước 2 lỗi | `schedules/bulk` fail: toast lỗi nhưng lớp đã tồn tại; bấm lại tạo trùng `code` (409) hoặc để lại lớp không có lịch | Lưu `created.id` để retry bước schedule, hoặc xóa lớp khi lỗi |
| UI-17 | Medium | `components/auth/oauth-callback.tsx:267-276` | Token nhận qua query string (`?accessToken&refreshToken`), không xóa khỏi URL trước khi điều hướng | Token lộ qua history, log proxy, Referer | Backend redirect bằng fragment (`#`) hoặc one-time code; FE `history.replaceState` ngay |
| UI-18 | Medium | `app/(app)/settings/page.tsx:1070-1096` vs gateway `user.schema.ts:55-95` | FE không kiểm tra max 14 ký tự và ký tự đặc biệt cho `newPassword`; ngược lại ép `currentPassword` thỏa độ phức tạp | Mật khẩu mới 15+ ký tự hoặc thiếu ký tự đặc biệt qua FE nhưng server 422; user có mật khẩu cũ không thỏa regex FE không đổi được | Đồng bộ quy tắc; `currentPassword` chỉ `min(1)` |
| UI-19 | Low | `lib/axios/auth-redirect.ts:5-15` | Kiểm tra cookie `access_token`/`accessToken` nhưng token chỉ ở localStorage, không bao giờ set cookie | `redirectIfAuthenticated` (login/register/forgot/reset) vô hiệu; chỉ dựa vào client effect (chớp form đăng nhập) | Bỏ hoặc set cookie thật |
| UI-20 | Low | `components/auth/login-form.tsx:70-85` | Response thiếu token vẫn `router.replace("/")` không báo lỗi; không validate rỗng email/password phía client | "Đăng nhập" xong bị đẩy về `/login`; submit form trống vẫn bắn request | Báo lỗi khi không có token; thêm rules |
| UI-21 | Low | `components/fees/tuitions-board.tsx:85` | `YEARS` hardcode 2024-2027 | Từ 2028 năm hiện tại không có trong Select | Sinh động quanh năm hiện tại |
| UI-22 | Low | `lib/services/class.service.ts:72` | `generateCode` là `useGet` luôn bật; mọi nơi gọi `useClassActions()` đều gọi `GET /classes/generate-code` | Request thừa mỗi trang dùng hook | Mặc định `enabled:false` |
| UI-23 | Low | `app/(app)/settings/page.tsx:760` | `URL.createObjectURL` không `revokeObjectURL` | Rò bộ nhớ nhỏ | Revoke khi xong/unmount |
| UI-24 | Low | `components/classes/page/exercise-submit-page.tsx:211-224` | Upload tuần tự nhiều file; lỗi giữa chừng thì danh sách `uploaded` bị bỏ cả các file đã lên | File mồ côi trên storage, user phải chọn lại | Stage từng file ngay khi thành công |
| UI-25 | Low | `app/(app)/notifications/[id]/page.tsx:153`, `app/(app)/page.tsx:397` | `redirectUrl` (server, <=500 ký tự, không validate scheme) đưa thẳng vào `href` | URL ngoài do người tạo thông báo đặt (React 19 chặn `javascript:`; còn rủi ro phishing). **Cần xác minh** ai được tạo notification | Chỉ cho path nội bộ hoặc whitelist http(s) |
| UI-26 | Low | `components/users/users-page.tsx:175` + gateway `user.controller.ts:165` | UI gửi `isActive` mong muốn, server lật trạng thái (bỏ qua body) | Double click / hai admin làm trạng thái ngược ý định | Backend nhận giá trị đích, hoặc FE disable khi pending |

## Chi tiết (High)

### UI-01 Socket không bao giờ kết nối
```tsx
// socket.provider.tsx
useEffect(() => {
  const token = useAuthStore.getState().accessToken;
  if (!token) return;
  const socket = io(`${SOCKET_URL}/chat`, { auth: { token }, ... });
  ...
}, []);
```
`SocketProvider` nằm trong `AuthProvider` (root layout). Effect của component con chạy trước effect `useHydrateOnMount` của cha, và store dùng `skipHydration: true`, nên lúc này `accessToken === null`. Vì deps rỗng, effect không chạy lại khi store hydrate xong hoặc khi user đăng nhập bằng điều hướng client (provider không remount). Ngoài ra `value={{ socket: socketRef.current ... }}` đọc ref lúc render nên context chỉ có socket sau re-render do `setIsConnected`; token cũng không được làm mới khi reconnect.

### UI-02/03 Schema session
Gateway `createSessionSchema` (`gateway/src/packages/entities/session/session.schema.ts`) yêu cầu `startAt`, `endAt`, `sessionNumber`; `updateSessionSchema` chỉ nhận `startAt/endAt`. UI (`schedule-form-dialog.tsx:136-143`) dựng `payload` với `date/startTime/endTime` và bỏ quên `startAt/endAt` đã tính ở dòng 130-131. Lưu ý `API_ENDPOINTS.md:276` của UI cũng mô tả payload `date/startTime/endTime` nên tài liệu lệch với code gateway thực tế.

### UI-04 PATCH không tồn tại
`session-detail-view.tsx:281` và `:393` gọi `axiosInstance.patch('/sessions/${sessionId}', ...)`; gateway chỉ có `@Put(':id')`. Luồng "cập nhật trạng thái" và "giao bài / import tài liệu" đều 404.

### UI-05 Hai kho token
```ts
// client.ts request interceptor
const token = useAuthStore.getState().accessToken || getAccessToken();
// client.ts:154-157 và refresh-access-token.ts:21-24
useAuthStore.getState().clearAuth();   // không xóa localStorage "accessToken"/"refreshToken"
```
`clearAuth` chỉ reset store (persist key `auth-store`). Các khóa legacy `accessToken/refreshToken` vẫn còn; do fallback ở interceptor, token đã bị coi là vô hiệu vẫn được gắn vào request.

### UI-06 Đăng xuất không dọn cache
```tsx
const signOut = () => { setAccessToken(null); router.push("/login"); };
```
`QueryClient` sống trong `useState` của `QueryProvider` (root) nên cache tồn tại qua đăng xuất/đăng nhập SPA. Query key không chứa user id. Hệ thống cũng không có endpoint logout để thu hồi refresh token phía server (`API_ENDPOINTS.md` không có `/auth/logout`).

### UI-11 Chat
Gateway `app.module.ts` không có module chat; mọi hook trong `useChat.hook.ts` (`/chat/conversations`, `/chat/users`, `/chat/unread`...) trả 404, và socket namespace `/chat` không được phục vụ bởi gateway.

## Vấn đề tích hợp với backend

| Điểm | UI | Backend thực tế | Hậu quả |
|---|---|---|---|
| `POST/PUT /sessions` | `date,startTime,endTime` | `startAt,endAt,sessionNumber` | 422 / bị strip (UI-02/03) |
| `PATCH /sessions/:id` | dùng | chỉ `PUT` | 404 (UI-04) |
| `/chat/*` REST + socket `/chat` | gateway URL | không có ở gateway (tutor-service riêng) | Discussions chết (UI-11) |
| `/users/avatar`, `/users/grades`, `/users/grade`, `/curriculum/grades` | dùng | không có route | UI-12 |
| `/curriculum/lessons/:id/theory\|add-theory\|exercises`, `DELETE /lesson/...` | dùng | không có | UI-13 |
| `/curriculum/by-grade/:id` | dùng | không có | UI-14 |
| `maxStudents` (class), `classCode`/`classId` (student) | gửi | schema không có, bị bỏ | UI-15 |
| Đổi mật khẩu | rule FE | max 14 + ký tự đặc biệt | UI-18 |
| `PUT /users/:id/status` | gửi `isActive` | toggle, bỏ qua body | UI-26 |
| `/auth/reset-password` | gửi `{jti,password,confirmPassword}` | `API_ENDPOINTS.md:70` ghi `{token,password}` và auth "JWT" | Tài liệu mâu thuẫn; **cần xác minh** endpoint có yêu cầu JWT không (nếu có thì luồng quên mật khẩu hỏng) |

## Ghi chú / Cần xác minh

- UI-10 (`atob` với base64url): chưa chạy với token thật; ảnh hưởng phụ thuộc nội dung JWT.
- UI-25: React 19 chặn `javascript:` href nên XSS thực sự khó xảy ra; còn rủi ro phishing nếu người tạo thông báo không tin cậy.
- UI-08: hành vi reuse refresh token phụ thuộc chính sách rotation của user-service (`/auth/refresh`).
- Access/refresh token nằm trong localStorage (cả hai kho) nên mọi XSS đều lấy được token; không phát hiện `dangerouslySetInnerHTML`/`innerHTML` trong `app/` và `components/`, rủi ro hiện tại thấp.
- `lib/api-gaps/gap-report.json` lỗi thời: các mục `/students` (`.students` khớp `user/src/features/student/student.service.ts:196`), `/admin/tutors` (`{ tutors, pagination }` khớp `admin.service.ts:132`), route-order `GET /curriculum/lessons` (LessonModule đứng trước CurriculumModule trong `gateway/src/app.module.ts`) đã kiểm tra lại và **không** còn là lỗi.
- Các trang mock (`accounts`, `analytics`, `budgets`, `investments`, `transactions`, `practice-exams`) dùng dữ liệu tĩnh; `/categories`, `/flow-requests` gọi endpoint không tồn tại. Không tính là bug logic nhưng chức năng không hoạt động.
- Chưa review sâu: `session-detail-page.tsx`, `grades-page.tsx`, `transactions-page.tsx`, `exercise-grade-workspace.tsx`, `flow-diagram.tsx`.
