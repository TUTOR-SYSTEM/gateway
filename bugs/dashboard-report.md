# Flow review: dashboard

- Luồng: UI (`ui/lib/services/dashboard.service.ts`, `ui/types/dashboard.types.ts`, `ui/app/(app)/page.tsx`) → gateway (`gateway/src/features/dashboard/dashboard.controller.ts`) → RMQ `dashboard.overview` → `tutor/src/features/dashboard/{dashboard.rpc.controller,dashboard.service}.ts`.
- Phương pháp: sub agent `flow-review-dashboard`, **chỉ đọc, chưa chạy test**. Ngày 2026-10-17.
- Verdict: **OK** (0 Critical, 0 Major, 2 Minor). Tổng hợp chung: `auth-report.md` mục 5.

## Bảng luồng
| UI | HTTP | RMQ | Khớp? |
|---|---|---|---|
| `overview` (service.ts:19) | GET /dashboard/overview | `dashboard.overview` `{userId}` | Có |

`dashboard` → `TUTOR_SERVICE` (`rmq.constants.ts:44`); mỗi phía 1 pattern.

## Critical
Không còn bug mở.

## Major
Không còn bug mở.

## Minor

| ID | Mức | Nội dung |
|---|---|---|
| — | Minor | `getOverview` gọi `userService.getUserRoleById` (`tutor/src/features/dashboard/dashboard.service.ts:78`): thêm một truy vấn DB mỗi request dù JWT có role; có thể truyền `role` từ gateway. |
| — | Minor | `tutor/src/features/dashboard/dashboard.controller.ts` (`@Controller('dashboard')`) HTTP trùng route `dashboard/overview`, song song `DashboardRpcController`; thừa nếu tutor không phơi HTTP. |

## Sạch
`userId` từ `@CurrentUser()` (không IDOR); không `@Public`; GET không cần Zod; lỗi dùng `ERROR_MESSAGES`; `recentNotifications` và type UI đã khớp response.

## Chưa xác minh
`dashboard.repository.ts` (scope truy vấn tutor/student); `unwrapApiData`/`api-error.ts`; xử lý lỗi của `page.tsx`.
