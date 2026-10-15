# Báo cáo lỗi tĩnh – Next.js Frontend (D:\projects\ui)

Phạm vi: review tĩnh (chỉ đọc code) các thư mục `app`, `components`, `hooks`, `lib`, `zustand`. Bỏ qua `node_modules`, `.next`. Không build/test. Chỉ ghi các lỗi đã xác minh bằng cách đọc code (các file rất lớn như `settings/page.tsx`, `grades-page.tsx`, `session-detail-*` chỉ được đọc chọn lọc nên đây chưa phải kết quả toàn diện).

## Thống kê theo mức độ

| Mức độ   | Số lỗi |
|----------|-------:|
| Critical | 0 |
| High     | 3 |
| Medium   | 11 |
| Low      | 10 |
| **Tổng** | **24** |

---

## HIGH

### UI-01 – High – SocketProvider không bao giờ kết nối (chat realtime hỏng)
- File: `components/providers/socket.provider.tsx:35-79` (mount ở `app/layout.tsx:58`)
- Mô tả: `useEffect(..., [])` đọc `useAuthStore.getState().accessToken` đúng 1 lần lúc mount. Store dùng `skipHydration: true`, token chỉ được rehydrate trong effect của `AuthProvider` (cha; effect của con chạy trước) nên lúc này token luôn `null` -> `return` sớm và không bao giờ thử lại. Sau khi đăng nhập (SPA, không reload) cũng không kết nối vì deps rỗng. Khi token được refresh hoặc user đăng xuất, socket cũ (nếu có) vẫn giữ token cũ/không bị đóng. Giá trị context `socket: socketRef.current` chỉ được đọc lúc render nên phụ thuộc re-render ngẫu nhiên.
- Cách sửa: subscribe `useAuthStore((s) => s.accessToken)` và đưa vào deps; chỉ tạo socket khi có token, `disconnect()` khi token đổi/null; lưu socket bằng `useState` thay vì ref để context cập nhật đúng.

### UI-02 – High – Lệch ngày/giờ khi sửa buổi học (UTC vs local) làm dời lịch
- File: `components/schedule/schedule-form-dialog.tsx:98-100` (dead code ở dòng 133-134)
- Mô tả: `dateStr = startDate.toISOString().split("T")[0]` lấy ngày theo UTC, trong khi `startTime/endTime` lấy bằng `getHours()/getMinutes()` (giờ local). Ở múi giờ VN (UTC+7), buổi học trước 07:00 sáng hiển thị lùi 1 ngày; khi bấm lưu, buổi học bị dời sang ngày sai. `startAt/endAt` tính ở dòng 133-134 không được dùng (payload gửi `date/startTime/endTime` thô).
- Cách sửa: dựng ngày bằng `getFullYear()/getMonth()/getDate()` local (hoặc `date-fns format`), xoá biến `startAt/endAt` không dùng.

### UI-03 – High – Tin nhắn chat bị mất im lặng khi socket chưa sẵn sàng
- File: `hooks/useChatSocket.hook.ts:192-198`, `components/discussions/discussions-page.tsx:286-293`
- Mô tả: `sendMessage` chỉ `socket.emit`; nếu `socket == null` (xem UI-01) thì `return` im lặng, nhưng `discussions-page` vẫn `setDraft("")` ngay sau đó -> người dùng mất nội dung vừa gõ mà không có thông báo lỗi, không có ack/optimistic update, không có fallback REST.
- Cách sửa: trả về boolean từ `sendMessage`, chỉ xoá draft khi gửi thành công; hiển thị toast/disable nút gửi khi `!isConnected`; dùng ack callback của socket.io.

---

## MEDIUM

### UI-04 – Medium – Giải mã JWT bằng `atob` sai với base64url; fallback role mặc định "TUTOR"
- File: `hooks/useCurrentUserRole.ts:20-30, 43`; `hooks/useCurrentUserId.ts:14-16`
- Mô tả: payload JWT là base64url (`-`, `_`) nhưng dùng `atob()` trực tiếp -> ném lỗi với một số token; ký tự Unicode trong claim cũng parse sai. Khi lỗi, `useCurrentUserRole` rơi về `"TUTOR"` – vai trò quyền cao hơn STUDENT/PARENT. Hệ quả: trong lúc `user` chưa tải, STUDENT/PARENT bị coi là TUTOR (UI hiện nút tạo/sửa, `RoleGuard` cho vào trang TUTOR; `isTutor` ở nhiều trang lớp học), còn ADMIN bị `RoleGuard` đá về `/` khi vào `/users`, `/tutors`... và không quay lại.
- Cách sửa: chuẩn hoá base64url (`replace(/-/g,'+').replace(/_/g,'/')` + padding + `TextDecoder`); khi chưa biết role trả `null` và hiển thị loading thay vì mặc định TUTOR.

### UI-05 – Medium – Đăng xuất không xoá cache React Query và không huỷ phiên phía server
- File: `components/layout/app-sidebar.tsx:196-199`; `components/providers/query.provider.tsx`
- Mô tả: `signOut` chỉ `setAccessToken(null)` + `router.push("/login")`. Không gọi API logout/revoke refresh token, không `queryClient.clear()`. Người dùng khác đăng nhập tiếp trên cùng trình duyệt có thể thấy dữ liệu cache của user trước (`gcTime` 5 phút, queryKey không chứa userId). Refresh token cũ vẫn còn hiệu lực phía server.
- Cách sửa: gọi endpoint logout (nếu có), `queryClient.clear()` và đóng socket khi đăng xuất / khi `clearAuth` do 401.

### UI-06 – Medium – Token "legacy" trong localStorage vẫn được dùng sau khi `clearAuth()`
- File: `lib/axios/client.ts:117, 155`; `lib/axios/refresh-access-token.ts:10, 22`
- Mô tả: request interceptor dùng `useAuthStore.getState().accessToken || getAccessToken()`. Các đường xử lý lỗi (refresh thất bại, `_retry401`) chỉ gọi `clearAuth()` mà không gọi `clearAuthTokens()`, nên key `accessToken/refreshToken` trong localStorage vẫn còn và tiếp tục được gắn Bearer ở request sau (token hết hạn/đã thu hồi). Token còn được lưu 2 nơi (`auth-store` persist + key legacy) làm tăng bề mặt XSS.
- Cách sửa: bỏ nguồn token legacy hoặc xoá nó trong `clearAuth`; chỉ giữ một nơi lưu token.

### UI-07 – Medium – Tài khoản ngân hàng nhận học phí hard-code cho mọi lớp/gia sư
- File: `lib/bank-info.ts:5-10`; `components/fees/tuition-pay-dialog.tsx:68`; `components/fees/tuition-detail-dialog.tsx:95`
- Mô tả: mã QR VietQR thanh toán học phí luôn dùng số tài khoản/tên chủ TK cố định (`1234567890123`, `PHAN DANG HAI`). Phụ huynh/học sinh của mọi gia sư đều chuyển tiền vào cùng một tài khoản (và là dữ liệu mẫu). Rủi ro nghiệp vụ/tài chính.
- Cách sửa: lấy thông tin ngân hàng từ API theo gia sư/lớp; ẩn nút QR nếu chưa cấu hình.

### UI-08 – Medium – Các route legacy (tài chính cá nhân/nội bộ) không bị giới hạn role
- File: `lib/rbac/route-access.ts:22-37`; `app/(app)/{accounts,transactions,budgets,categories,investments,analytics,api-gaps,practice-exams}`; `app/(flow)/flow-request`
- Mô tả: các route này không có trong `ROUTE_ACCESS` nên "mọi role đã đăng nhập" đều vào được (STUDENT/PARENT gõ URL `/transactions`, `/accounts`, `/api-gaps`, `/flow-request`...). Chúng gọi API `/transactions`, `/wallets`... không thuộc nghiệp vụ gia sư hoặc là công cụ nội bộ dành cho ADMIN (trong khi `/flow-requests` thì có `RoleGuard ADMIN`). `/reports` chỉ tự chặn trong component. Mặc định đang là "cho phép tất cả" thay vì "từ chối".
- Cách sửa: đổi mặc định thành deny, thêm `/reports`, `/flow-request`, `/api-gaps` (ADMIN) vào bảng, xoá/ẩn trang không dùng. (Lưu ý: UI guard chỉ là UX, backend phải tự kiểm tra quyền.)

### UI-09 – Medium – OAuth callback nhận token qua query string
- File: `components/auth/oauth-callback.tsx:29-37`
- Mô tả: `accessToken`/`refreshToken` nằm trên URL (lịch sử trình duyệt, log reverse proxy, Referer). `router.replace("/")` đổi URL nhưng token đã bị ghi lại trước đó; không có `state`/kiểm tra định dạng token chống login-CSRF. Token sau đó lưu localStorage (dễ bị đánh cắp khi có XSS).
- Cách sửa: backend trả token qua cookie httpOnly hoặc fragment (`#`)/mã một lần đổi lấy token qua POST; kiểm tra `state`.

### UI-10 – Medium – `href` lấy từ dữ liệu server không được kiểm tra scheme
- File: `app/(app)/notifications/[id]/page.tsx:152-154` (`notification.redirectUrl`); `components/classes/page/class-detail-watch-page.tsx:702` (`startsWith("http")`)
- Mô tả: `redirectUrl` được render thẳng vào `<a href>`; giá trị `javascript:...` có thể thực thi script khi click nếu API cho phép nội dung do user kiểm soát. `cls.location.startsWith("http")` quá lỏng (khớp cả `httpfoo:`), URL tuỳ ý do gia sư đặt hiển thị như "Vào lớp học" (phishing).
- Cách sửa: parse bằng `new URL()` và chỉ cho phép `http:`/`https:` (hoặc đường dẫn nội bộ bắt đầu bằng `/`).

### UI-11 – Medium – Widget AI hiển thị kết quả cũ/lời chào thay vì trạng thái đang tải
- File: `components/ai-chat/ai-analysis-widget.tsx:78, 150-158`; `hooks/useAiChat.hook.ts:26-37`
- Mô tả: `lastReply` là tin assistant cuối cùng; danh sách luôn bắt đầu bằng `WELCOME_MESSAGE` (assistant, có nội dung) nên điều kiện `isSending && !lastReply?.content` không bao giờ đúng -> spinner không hiện; trong lúc chờ, người dùng thấy lời chào hoặc kết quả tác vụ trước, dễ nhầm là kết quả tác vụ vừa chọn. Lịch sử không giới hạn độ dài được gửi lên mỗi lần; các prompt (thu học phí, chấm bài) hiển thị cho cả STUDENT/PARENT/ADMIN.
- Cách sửa: dựa vào `isSending` để hiện spinner bất kể nội dung, cắt history, lọc task theo role.

### UI-12 – Medium – Upload nhiều tệp: một tệp lỗi làm mất cả các tệp đã tải lên
- File: `components/classes/page/exercise-submit-page.tsx:200-225`
- Mô tả: vòng lặp tải tuần tự gom vào mảng cục bộ `uploaded`, chỉ `setStaged` sau khi tất cả thành công. Nếu tệp thứ N lỗi, các tệp 1..N-1 đã lên server nhưng không vào `staged` (mồ côi, học sinh phải chọn lại toàn bộ). Không kiểm tra dung lượng/loại tệp phía client.
- Cách sửa: `setStaged` sau từng tệp thành công (hoặc `Promise.allSettled`), báo lỗi theo từng tệp, validate size/mime trước khi upload.

### UI-13 – Medium – Không thể xoá mô tả/địa điểm/giáo trình khi sửa lớp
- File: `components/classes/dialog/edit-class-dialog.tsx:263-271`
- Mô tả: `description.trim() || undefined`, `location || undefined`, `curriculumId || undefined`, `endTime ? ... : undefined`. Khi người dùng xoá trống các trường này, payload bỏ trường (JSON bỏ `undefined`) nên server giữ nguyên giá trị cũ; giao diện báo đã lưu nhưng dữ liệu không đổi.
- Cách sửa: gửi `null` (hoặc chuỗi rỗng) khi người dùng chủ động xoá, nếu API hỗ trợ.

### UI-14 – Medium – Ngày mặc định/hiển thị theo UTC trong nhiều form
- File: `components/classes/dialog/create-session-dialog.tsx:18, 45`; `components/fees/tuition-detail-dialog.tsx:70`; `components/classes/dialog/edit-class-dialog.tsx:49-55`
- Mô tả: `new Date().toISOString().slice(0,10)` là ngày UTC. Ở VN từ 00:00-07:00 "hôm nay" mặc định là hôm qua (buổi học tạo sai ngày, "ngày đóng" học phí ghi sai ngày). `toDateInput` của edit-class hiển thị ngày bắt đầu/kết thúc lùi 1 ngày nếu server lưu mốc nửa đêm giờ VN; lưu lại sẽ ghi đè sai.
- Cách sửa: format theo ngày local (`getFullYear/getMonth/getDate`) hoặc dùng `date-fns`/`dayjs`.

---

## LOW

### UI-15 – Low – Form đăng nhập: không validate, `rememberMe` vô tác dụng, thành công không token vẫn điều hướng
- File: `components/auth/login-form.tsx:74-86, 92-124, 161, 225-233`
- Mô tả: `noValidate` + không có rule nên gửi request với email/mật khẩu rỗng; checkbox "Ghi nhớ" được đăng ký nhưng không đọc ở đâu. `handleLoginSuccess` nếu không có token vẫn `router.replace("/")` (rồi bị đá về login mà không báo lỗi). Token lưu 2 lần (`setAuthTokens` + `saveAuthTokens`) với ngữ nghĩa `refreshToken` khác nhau (`undefined` vs `null`) nên localStorage legacy và store có thể lệch.
- Cách sửa: thêm rule required/email, báo lỗi khi thiếu token, dùng một hàm lưu token duy nhất, hiện thực hoặc bỏ "ghi nhớ".

### UI-16 – Low – Form đăng ký/đặt lại mật khẩu thiếu validate phía client
- File: `components/auth/register-form.tsx:47-80`; `components/auth/reset-pass.tsx:36-67`
- Mô tả: chỉ so khớp password và confirm; không kiểm tra rỗng, độ dài tối thiểu, định dạng email (phụ thuộc hoàn toàn server).
- Cách sửa: thêm rule (required, minLength, pattern email) trong `register()` của react-hook-form.

### UI-17 – Low – `redirectIfAuthenticated` là code chết
- File: `lib/axios/auth-redirect.ts:5-15`; `app/(auth)/login/page.tsx:36-38`
- Mô tả: kiểm tra cookie `access_token`/`accessToken` ở server, nhưng app lưu token trong localStorage và không đâu đặt cookie nên không bao giờ redirect; gây cảm giác an toàn giả và khiến trang login render động (SSR) vô ích.
- Cách sửa: xoá, hoặc chuyển token sang cookie httpOnly và dùng middleware.

### UI-18 – Low – Hồ sơ cá nhân: rò rỉ Object URL, không kiểm tra loại ảnh, state stale
- File: `app/(app)/settings/page.tsx:750-785, 818-823`
- Mô tả: `URL.createObjectURL(file)` không `revokeObjectURL`; chỉ kiểm tra kích thước (không kiểm tra mime/ext); nhánh `size > 2MB` return trước khi reset `input.value` nên không chọn lại được cùng tệp; dùng `alert()` chặn UI; `setTimeout(() => setProfileSaved(false), 2000)` không clear khi unmount; `setUser({...user, ...form})` dùng `user` đã đóng gói (stale closure) và ghi đè bằng chuỗi rỗng.
- Cách sửa: revoke URL, validate mime, dùng toast, clear timer, cập nhật store theo state mới nhất.

### UI-19 – Low – Badge thông báo trên sidebar hard-code = 5
- File: `components/layout/app-sidebar.tsx:50`
- Mô tả: `badge: 5` luôn hiển thị "5" bất kể số thông báo chưa đọc thật.
- Cách sửa: lấy từ API số chưa đọc, ẩn khi bằng 0.

### UI-20 – Low – Số đếm theo loại thông báo chỉ tính trên trang hiện tại
- File: `app/(app)/notifications/page.tsx:213, 224-236`
- Mô tả: `total` lấy từ server nhưng đếm từng loại bằng `notificationList.filter(...)` chỉ trên 1 trang (khi lọc theo tab các tab khác luôn 0) -> số liệu sai. `selectedNotification` thành `null` khi đổi trang/tìm kiếm trong khi `selectedId` vẫn còn. `notificationList = apiPayload?.data ?? []` tạo mảng mới mỗi render khiến `useMemo` vô tác dụng (đã tắt cảnh báo bằng eslint-disable).
- Cách sửa: lấy count từ API, bọc danh sách bằng `useMemo`, reset `selectedId` khi đổi bộ lọc.

### UI-21 – Low – Học phí: đổi về "Chưa đóng" vẫn gửi `paidDate`; không xoá được ngày đóng
- File: `components/fees/tuition-detail-dialog.tsx:66-86`; `components/fees/tuition-pay-dialog.tsx:63-67`
- Mô tả: `handleStatusChange` chỉ tự điền `paidDate` khi sang PAID, không xoá khi đổi lại UNPAID; payload gửi `paidDate` cùng `status: UNPAID` (dữ liệu mâu thuẫn). Xoá ô ngày -> `undefined` nên server không xoá. Hoá đơn `OVERDUE` không có option trong Select (chỉ UNPAID/PAID). `tuition.student/class` truy cập không kiểm tra null.
- Cách sửa: khi status != PAID gửi `paidDate: null`; thêm option OVERDUE; dùng optional chaining.

### UI-22 – Low – Tìm kiếm gọi API theo từng phím gõ (không debounce)
- File: `components/users/users-page.tsx:335`; `components/tutors/tutors-page.tsx:128`; `components/fees/tuitions-board.tsx:245`; `app/(app)/notifications/page.tsx:259`; `components/reports/reports-page.tsx:274`
- Mô tả: `search` đưa thẳng vào queryKey/params nên mỗi ký tự là một request (hook `useDebounce` đã có nhưng không được dùng).
- Cách sửa: dùng `useDebounce(search, 400)` cho giá trị đưa vào query.

### UI-23 – Low – Chat: typing/room/online chưa xử lý đúng
- File: `components/discussions/discussions-page.tsx:262-267, 296-302, 331-337`; `hooks/useChatSocket.hook.ts:148-157`; `components/providers/socket.provider.tsx:54-57`
- Mô tả: `startTyping()` phát mỗi lần gõ phím (không throttle), sau khi gửi tin không `stopTyping()` nên chỉ báo "đang gõ" bị kẹt; chỉ lưu 1 userId cho mỗi hội thoại; `handleStartConversation` không try/catch (`mutateAsync` lỗi -> unhandled rejection); khi socket reconnect không `conversation:join` lại phòng; `onlineUsers` không xoá khi `disconnect`; tin mới ở hội thoại đang mở không được đánh dấu đã đọc.
- Cách sửa: throttle typing, gọi `stopTyping` sau khi gửi, bọc try/catch + toast, join lại phòng ở sự kiện `connect`.

### UI-24 – Low – Metadata/ngôn ngữ và dashboard sai theo role
- File: `app/layout.tsx:36, 46`; `app/(app)/page.tsx:137-147`; `components/transactions/transactions.data.ts:80-95`
- Mô tả: `description` toàn site vẫn là "Theo doi thu chi va tai chinh ca nhan" (code finance cũ) và `<html lang="en">` trong khi UI tiếng Việt; dashboard chỉ phân biệt `isStudent` nên PARENT/ADMIN dùng nhãn/thống kê của gia sư; danh mục/ví giới hạn cứng `limit: 100` (dữ liệu >100 dòng bị thiếu -> hiển thị "Uncategorized").
- Cách sửa: sửa metadata, `lang` theo locale store, tách nội dung dashboard theo role, phân trang/tải đủ dữ liệu tham chiếu.
