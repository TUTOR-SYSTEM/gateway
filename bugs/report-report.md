# Flow review: report

- Luồng: UI (`ui/components/reports/reports-page.tsx`, `ui/types/report.types.ts`; không có `ui/lib/services/report.service.ts`) → gateway (`gateway/src/features/report/report.controller.ts`, `packages/entities/report/report.schema.ts`) → RMQ `report.*` → `tutor/src/features/report/{report.rpc.controller,report.service}.ts`.
- Phương pháp: sub agent `flow-review-report`, **chỉ đọc, chưa chạy test**. Ngày 2026-10-17.
- Verdict: **OK** (0 Critical, 0 Major, 2 Minor). Tổng hợp chung: `auth-report.md` mục 5.

## Bảng luồng
| UI | HTTP | RMQ | Khớp? |
|---|---|---|---|
| `useGet` (`reports-page.tsx:70`) | GET /reports/learning/summary | `report.summary` `{userId}` | Có |
| `reports-page.tsx:82` | GET /reports/learning/attendance-trend | `report.attendanceTrend` `{userId}` | Có |
| `reports-page.tsx:99` `{page, limit, search?}` | GET /reports/learning/classes | `report.classList` `{query, userId}` | Có |

3/3 pattern khớp. `report` → `TUTOR_SERVICE` (`rmq.constants.ts:45`); module đăng ký `app.module.ts:54`.

## Minor

| ID | Mức | Nội dung |
|---|---|---|
| — | Minor | UI gọi `useGet` trực tiếp trong component, không có hàm trong `ui/lib/services/` (`reports-page.tsx:65-106`); khác convention. |
| — | Minor | `ui/API_ENDPOINTS.md:561` có dòng "422 Query invalid" trùng route; schema `min(1)`/`max(100)` đúng ý. |

## Sạch
Query `page/limit/search` khớp `getLearningClassReportsQuerySchema`; type UI khớp `LearningReportSummary`, `AttendanceTrendPoint {month, rate}`, `ClassReportsApiPayload`; không dùng `.partial()` nên không dính `.default()`; `limit` có `default` hợp lệ cho query GET.

## Chưa xác minh
`unwrapApiData`/`useGet`/`api-error.ts`; truy vấn trong `report.repository.ts` (`getClassesPage`, escape `search`); `UserService` có sẵn trong `report.module.ts` của tutor; `tutor/src/features/report/report.controller.ts` (HTTP `reports/learning`) có được mount.
