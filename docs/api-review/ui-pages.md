# TUTOR-UI: Page Routes and API Calls

Scanned: 2026-10-10
Module: `/home/haidangphan/Documents/tutor/TUTOR-UI` (read-only review; source is truth, existing `API_ENDPOINTS.md` / `PAGES.md` / `flow.md` not used as a reference for behaviour)

Conventions used below:
- Base URL: `API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.trim() || "http://localhost:8888"` (`lib/axios/client.ts:102`), no `/api` prefix. Sockets: `NEXT_PUBLIC_API_URL` (`components/providers/socket.provider.tsx:28`) and `NEXT_PUBLIC_THIRD_SERVICE_URL` default `http://localhost:4000` (`hooks/useLogSocket.hook.ts:14`).
- Every REST call goes through `axiosInstance` (`lib/axios/client.ts`): `Authorization: Bearer <accessToken>` is attached on every request when a token exists (zustand `auth-store`, fallback localStorage `accessToken`), plus `Accept-Language`. On 401 it calls `POST /auth/refresh` once and retries; `/auth/login|register|forgot-password|reset-password` are excluded from refresh.
- Hook wrappers: `lib/axios/query.ts` (`useGet`/`usePost`/`usePut`/`usePatch`/`useDelete`) and the per-domain `use*Actions()` hooks in `lib/services/*.service.ts`. Responses are wrapped `{ data: T }` and unwrapped with `unwrapApiData`.
- `file:line` = call site in the page/component that triggers the request (service definition line in brackets when relevant).
- "NOT REAL API" marks pages/requests that are static, mocked, or hard-coded.

---

## 1. Routes

### Pages (44)

Route groups `(app)`, `(admin)`, `(auth)`, `(flow)` are stripped from URLs.

| Page URL | File |
|---|---|
| `/` | `app/(app)/page.tsx` |
| `/accounts` | `app/(app)/accounts/page.tsx` |
| `/ai-chat` | `app/(app)/ai-chat/page.tsx` |
| `/analytics` | `app/(app)/analytics/page.tsx` |
| `/budgets` | `app/(app)/budgets/page.tsx` |
| `/categories` | `app/(app)/categories/page.tsx` |
| `/classes` | `app/(app)/classes/page.tsx` |
| `/classes/[id]` | `app/(app)/classes/[id]/page.tsx` |
| `/classes/[id]/curriculum` | `app/(app)/classes/[id]/curriculum/page.tsx` |
| `/classes/[id]/exercise` | `app/(app)/classes/[id]/exercise/page.tsx` |
| `/classes/[id]/sessions/[sessionId]` | `app/(app)/classes/[id]/sessions/[sessionId]/page.tsx` |
| `/classes/[id]/sessions/[sessionId]/exercise` | `app/(app)/classes/[id]/sessions/[sessionId]/exercise/page.tsx` |
| `/classes/[id]/sessions/[sessionId]/submissions` | `app/(app)/classes/[id]/sessions/[sessionId]/submissions/page.tsx` |
| `/classes/[id]/sessions/[sessionId]/submissions/[exerciseId]` | `app/(app)/classes/[id]/sessions/[sessionId]/submissions/[exerciseId]/page.tsx` |
| `/curriculum` | `app/(app)/curriculum/page.tsx` |
| `/curriculum/[id]` | `app/(app)/curriculum/[id]/page.tsx` |
| `/discussions` | `app/(app)/discussions/page.tsx` |
| `/fees` | `app/(app)/fees/page.tsx` |
| `/grades` | `app/(app)/grades/page.tsx` |
| `/investments` | `app/(app)/investments/page.tsx` |
| `/logger` (admin) | `app/(app)/(admin)/logger/page.tsx` |
| `/notifications` | `app/(app)/notifications/page.tsx` |
| `/notifications/[id]` | `app/(app)/notifications/[id]/page.tsx` |
| `/practice-exams` | `app/(app)/practice-exams/page.tsx` |
| `/practice-exams/[id]` | `app/(app)/practice-exams/[id]/page.tsx` |
| `/practice-exams/[id]/result` | `app/(app)/practice-exams/[id]/result/page.tsx` |
| `/reports` | `app/(app)/reports/page.tsx` |
| `/schedule` | `app/(app)/schedule/page.tsx` |
| `/sessions` | `app/(app)/sessions/page.tsx` |
| `/sessions/[id]` | `app/(app)/sessions/[id]/page.tsx` |
| `/settings` | `app/(app)/settings/page.tsx` |
| `/students` | `app/(app)/students/page.tsx` |
| `/students/[id]` | `app/(app)/students/[id]/page.tsx` |
| `/test-monitor` (admin) | `app/(app)/(admin)/test-monitor/page.tsx` |
| `/tutors` (admin) | `app/(app)/(admin)/tutors/page.tsx` |
| `/users` (admin) | `app/(app)/(admin)/users/page.tsx` |
| `/transactions` | `app/(app)/transactions/page.tsx` |
| `/login` | `app/(auth)/login/page.tsx` |
| `/register` | `app/(auth)/register/page.tsx` |
| `/forgot-password` | `app/(auth)/forgot-password/page.tsx` |
| `/reset-password` | `app/(auth)/reset-password/page.tsx` |
| `/oauth/callback` | `app/(auth)/oauth/callback/page.tsx` |
| `/flow-request` | `app/(flow)/flow-request/page.tsx` |
| `/flow-requests` | `app/flow-requests/page.tsx` |

### Layouts (11)

| File | Role |
|---|---|
| `app/layout.tsx` | Root: fonts, `QueryProvider > ThemeProvider > ColorThemeProvider > AuthProvider > SocketProvider` |
| `app/(app)/layout.tsx` | Imports `./root.layout` (sidebar, header, `AuthGuard`, `RouteAccessGuard`, `AiAnalysisWidget`) |
| `app/(app)/root.layout.tsx` | Mounts `components/ai-chat/ai-analysis-widget.tsx` on every `(app)` page |
| `app/(app)/(admin)/layout.tsx` | `RoleGuard allow=["ADMIN"]` (wraps logger, test-monitor, tutors, users) |
| `app/(app)/(tutor)/layout.tsx` | `RoleGuard allow=["TUTOR"]` - **no pages inside this group** (dead) |
| `app/(app)/(parent)/layout.tsx` | No pages inside this group (dead) |
| `app/(app)/(student)/layout.tsx` | No pages inside this group (dead) |
| `app/(auth)/layout.tsx` | Imports `./auth.layout` |
| `app/(auth)/auth.layout.tsx` | Auth shell; `useAuth` from `@/hooks` (no request) |
| `app/(flow)/layout.tsx` | Layout for `/flow-request` (no request seen) |
| `app/flow-requests/layout.tsx` | Layout for `/flow-requests` (no request seen) |

### Route handlers (`app/api/**/route.ts`)

None. The app has no `app/api` directory and no `middleware.ts`/`proxy.ts`, so route protection is client-side only.

---

## 2. Summary table

Requests column lists the backend endpoints triggered by the page (directly or via components it renders). "static" = no request.

| Page URL | File | Requests made |
|---|---|---|
| `/` | `app/(app)/page.tsx` | GET `/dashboard/overview` |
| `/accounts` | `app/(app)/accounts/page.tsx` | NOT REAL API (static `MOCK_ACCOUNTS`) |
| `/ai-chat` | `app/(app)/ai-chat/page.tsx` | POST `/ai-chat/chat` |
| `/analytics` | `app/(app)/analytics/page.tsx` | NOT REAL API (static) |
| `/budgets` | `app/(app)/budgets/page.tsx` | NOT REAL API (static) |
| `/categories` | `app/(app)/categories/page.tsx` | GET/POST `/categories`, PUT/DELETE `/categories/:id` |
| `/classes` | `app/(app)/classes/page.tsx` | GET `/classes`; GET `/classes/generate-code`, POST `/classes`, POST `/schedules/bulk`, GET `/curriculum`; PUT `/classes/:id`; DELETE `/classes/:id`; GET `/classes/:id/students`, GET `/students`; POST `/curriculum`; POST `/sessions`; PUT `/sessions/:id`; GET `/upload/download` |
| `/classes/[id]` | `app/(app)/classes/[id]/page.tsx` | GET `/classes/:id`, GET `/classes/:id/students`, GET `/curriculum/lessons`, GET `/sessions`, PUT `/sessions/:id`, PUT `/classes/:id`, GET `/users/get-by-field`, GET `/tuitions`, GET `/notifications`, GET `/classes/:id/watches`, GET `/classes/:id/materials` (watch view, see notes) |
| `/classes/[id]/curriculum` | `app/(app)/classes/[id]/curriculum/page.tsx` | GET `/classes/:id/materials`, GET `/upload/download` |
| `/classes/[id]/exercise` | `app/(app)/classes/[id]/exercise/page.tsx` | GET `/classes/:id/materials`, GET `/upload/download` |
| `/classes/[id]/sessions/[sessionId]` | `app/(app)/classes/[id]/sessions/[sessionId]/page.tsx` | GET `/sessions/:id`, GET `/curriculum/:curriculumId`, GET `/attendances/session/:id`, GET `/curriculum/lessons/:lessonId`, PUT `/sessions/:id`, PUT `/attendances`, GET `/upload/download` |
| `/classes/[id]/sessions/[sessionId]/exercise` | `app/(app)/classes/[id]/sessions/[sessionId]/exercise/page.tsx` | GET `/sessions/:id`, GET `/exercises`, GET `/users/get-by-field`, GET `/classes/:id/students`, GET `/attendances/session/:id`, POST `/upload`, PATCH `/exercises/:id/submit`, POST `/exercises` |
| `/classes/[id]/sessions/[sessionId]/submissions` | `app/(app)/classes/[id]/sessions/[sessionId]/submissions/page.tsx` | GET `/sessions/:id`, GET `/classes/:id/students`, GET `/exercises`, GET `/upload/download` |
| `/classes/[id]/sessions/[sessionId]/submissions/[exerciseId]` | `.../submissions/[exerciseId]/page.tsx` | GET `/sessions/:id`, GET `/classes/:id/students`, GET `/exercises`, POST `/upload`, PATCH `/exercises/:id/grade`, GET `/upload/download` |
| `/curriculum` | `app/(app)/curriculum/page.tsx` | GET `/curriculum`, GET `/curriculum/generate-code`, POST `/curriculum`, PUT `/curriculum/:id`, DELETE `/curriculum/:id`, GET `/upload/download` |
| `/curriculum/[id]` | `app/(app)/curriculum/[id]/page.tsx` | GET `/curriculum/:id`, DELETE `/chapter/:id`, POST `/chapter/:frameworkId`, POST `/curriculum/lessons?curriculumId&chapterId`, DELETE `/curriculum/lessons/:id`, PUT/DELETE `/curriculum/lessons/:id/(add-theory\|exercises)`, GET `/upload/download` |
| `/discussions` | `app/(app)/discussions/page.tsx` | GET `/chat/conversations`, GET `/chat/conversations/:id/messages`, GET `/chat/users`, POST `/chat/conversations/direct`, POST `/chat/conversations/:id/read`; socket `/chat` |
| `/fees` | `app/(app)/fees/page.tsx` | GET `/tuitions`, GET `/classes`, GET `/classes/:id/students`, POST `/tuitions`, PUT `/tuitions/:id`, GET `/students` (family view) |
| `/grades` | `app/(app)/grades/page.tsx` | GET `/classes`, GET `/classes/:id/students`, GET `/sessions`, GET `/exercises`, GET `/curriculum/by-grade/:gradeId`, GET `/users/grades` |
| `/investments` | `app/(app)/investments/page.tsx` | NOT REAL API (static `HOLDINGS`) |
| `/logger` | `app/(app)/(admin)/logger/page.tsx` | GET `/logs`, GET `/logs/trace/:correlationId`, GET `/logs/stats`, GET `/test-scenarios`, POST `/test-scenarios/:id/run?async=true`; socket `/logs` |
| `/notifications` | `app/(app)/notifications/page.tsx` | GET `/notifications`, PATCH `/notifications/:id/read` |
| `/notifications/[id]` | `app/(app)/notifications/[id]/page.tsx` | GET `/notifications/:id`, PATCH `/notifications/:id/read` |
| `/practice-exams` | `app/(app)/practice-exams/page.tsx` | NOT REAL API (static data files) |
| `/practice-exams/[id]` | `app/(app)/practice-exams/[id]/page.tsx` | NOT REAL API (static data files) |
| `/practice-exams/[id]/result` | `app/(app)/practice-exams/[id]/result/page.tsx` | NOT REAL API (static data files) |
| `/reports` | `app/(app)/reports/page.tsx` | GET `/reports/learning/summary`, GET `/reports/learning/attendance-trend`, GET `/reports/learning/classes` (ADMIN only) |
| `/schedule` | `app/(app)/schedule/page.tsx` | GET `/sessions`, GET `/classes`, POST `/sessions`, PUT `/sessions/:id`, DELETE `/sessions/:id` |
| `/sessions` | `app/(app)/sessions/page.tsx` | GET `/sessions`, GET `/sessions/:id`, GET `/classes/:id/students`, GET `/attendances/session/:id`, GET `/exercises`, GET `/curriculum/lessons`, GET `/users/get-by-field`, POST `/upload`, PATCH `/exercises/:id/submit`, POST `/exercises` |
| `/sessions/[id]` | `app/(app)/sessions/[id]/page.tsx` | Same as `/sessions` (same components) |
| `/settings` | `app/(app)/settings/page.tsx` | GET `/users/detail-user`, PUT `/users`, POST `/users/avatar`, POST `/users/change-password`, GET `/users/grades`, GET `/curriculum/grades`, PUT `/users/grade`, GET `/students` (parent view) |
| `/students` | `app/(app)/students/page.tsx` | GET `/students`, DELETE `/students/:id`, GET `/classes`, GET `/students/get-student-code`, POST `/students`, PUT `/students/:id`, GET `/classes/:id/students` |
| `/students/[id]` | `app/(app)/students/[id]/page.tsx` | GET `/students/:id`, GET `/exercises`, PUT `/students/:id` (edit dialog), GET `/classes` |
| `/test-monitor` | `app/(app)/(admin)/test-monitor/page.tsx` | GET `/test-scenarios`, `/test-scenarios/stats`, `/test-scenarios/routes`, `/test-scenarios/meta`, `/test-scenarios/:id/runs`, `/test-scenarios/fixtures`, `/test-scenarios/auth-profiles`, `/logs/stats`, `/logs/trace/:id`; POST `/test-scenarios`, `/test-scenarios/generate`, `/test-scenarios/bulk`, `/test-scenarios/:id/run`, `/test-scenarios/fixtures`, `/test-scenarios/fixtures/:id/resolve`; PATCH `/test-scenarios/:id`, `/test-scenarios/fixtures/:id`; DELETE `/test-scenarios/:id`, `/test-scenarios/fixtures/:id`. Mock mode (`?mock=1`) bypasses all of it. |
| `/tutors` | `app/(app)/(admin)/tutors/page.tsx` | GET `/admin/tutors`, POST `/admin/tutors` |
| `/users` | `app/(app)/(admin)/users/page.tsx` | GET `/users`, POST `/users`, PUT `/users/:id`, PUT `/users/:id/status`, DELETE `/users/:id` |
| `/transactions` | `app/(app)/transactions/page.tsx` | NOT REAL API (static `TRANSACTIONS`); `useTransactionsList` in `transactions.data.ts` is unused |
| `/login` | `app/(auth)/login/page.tsx` | POST `/auth/login`, POST `/auth/login/user-code` |
| `/register` | `app/(auth)/register/page.tsx` | POST `/auth/register` |
| `/forgot-password` | `app/(auth)/forgot-password/page.tsx` | POST `/auth/forgot-password` |
| `/reset-password` | `app/(auth)/reset-password/page.tsx` | POST `/auth/reset-password` |
| `/oauth/callback` | `app/(auth)/oauth/callback/page.tsx` | None (reads tokens from query string) |
| `/flow-request` | `app/(flow)/flow-request/page.tsx` | NOT REAL API (static `flow-request.data.ts`) |
| `/flow-requests` | `app/flow-requests/page.tsx` | GET `/flow-requests`, POST `/flow-requests`, PUT `/flow-requests/:id`, DELETE `/flow-requests/:id` (GET falls back to seed data) |

---

## 3. Global requests (every page)

These run from providers/layouts, not from a page.

| Method + path | Trigger (file:line) | Payload | Response used | States | Auth |
|---|---|---|---|---|---|
| GET `/users/detail-user` | `components/providers/auth.provider.tsx:107` (session check on mount when access token exists); `:139` after refresh | none | `ApiUser` -> `setUser` (role, avatar, name) | No loading UI; `sessionChecked` flag; 401 -> refresh; other errors mark session checked | Bearer |
| POST `/auth/refresh` | `lib/axios/auth-refresh.ts` (`postAuthRefresh`), used by `refresh-access-token.ts` and `auth.provider.tsx:131` | `{ refreshToken }` | `accessToken`, `refreshToken` (unwrapped from `{data}` if present) | Failure clears auth and redirects to `/login` | none (no Bearer, by design) |
| Socket.io `/chat` namespace | `components/providers/socket.provider.tsx:39` | `auth: { token }` | Listens `user:status` (online set) | Connect/disconnect/connect_error logs | token in handshake |
| POST `/ai-chat/chat` | `components/ai-chat/ai-analysis-widget.tsx:67` via `hooks/useAiChat.hook.ts:38` | `{ message: string, history: {role, content}[] }` | `{ reply }` | `isSending`; error -> assistant message with `getErrorMessage` | Bearer |

Notes: `redirectIfAuthenticated` (`lib/axios/auth-redirect.ts`) reads cookies `access_token` / `accessToken`, but nothing in the codebase sets cookies, so server-side redirect from `/login` etc. does not trigger (see section 6).

---

## 4. Requests per page

Each entry: method + path, payload, response used, states handled. Entries marked **NOT REAL API** are static.

### `/` Dashboard (`app/(app)/page.tsx`)
- **GET `/dashboard/overview`** via `useDashboardActions().overview` (`lib/services/dashboard.service.ts`; called at `page.tsx:141`). No payload. Response (`DashboardOverview`): `stats.{classesCount, studentsCount, sessionsThisWeek, sessionsCompletedThisWeek, revenueThisMonth, overdueTuitionCount, unpaidTuitionAmount}`, `todaySchedule[]`, `recentNotifications[]`, `monthly[]` (chart). States: `isLoading` (banner text, skeleton cards), `isError` banner (`:212`), empty schedule text. Bearer.

### `/accounts` (NOT REAL API)
- Static `MOCK_ACCOUNTS` / `MOCK_TRANSACTIONS` in `components/accounts/accounts.data.ts:103,174`. No requests. Wallet/transaction dialogs only mutate local state (not traced further).

### `/ai-chat` (`components/ai-chat/ai-chat.tsx`)
- **POST `/ai-chat/chat`** via local `usePost` (`ai-chat.tsx:18`, `mutate` at `:34`). Payload `{ message, history: {role, content}[] }` (full message list is sent as history). Response `{ reply }` read via `unwrapApiData`; `data?.reply ?? ""` is appended. States: `isPending` disables input; `onError` appends a fixed Vietnamese error message. Bearer.

### `/analytics` (NOT REAL API)
- `TOP_CATEGORIES` and charts are hard-coded in `components/analytics/analytics-page.tsx`. No requests.

### `/budgets` (NOT REAL API)
- `MONTHLY` constant (`components/budgets/budgets-page.tsx:14`) and `budgetItems` (`components/dashboard/budget-overview-card.tsx:7`) are hard-coded. No requests.

### `/categories` (`components/categories/categories-page.tsx`)
- **GET `/categories`** `params {page:1, limit:100}` (`:179`). Response `data[]` mapped via `mapApiCategory`. States: `isPending`, `isError` (handled).
- **POST `/categories`** (`:197`) payload `{ userId, name, type, icon, color, parent_id }` (`userId` = current user id). Success: invalidate + toast; error toast.
- **PUT `/categories/:id`** (`:209`) payload `{ id, name, type, icon, color, parent_id }`.
- **DELETE `/categories/:id`** (`:221`). Toast on success/error.
- Bearer. Note: these endpoints are not in any `lib/services/*` file; defined inline.

### `/classes` (`components/classes/page/classes-page.tsx`, dialogs in `components/classes/dialog/`)
- **GET `/classes`** via `useClassActions({list:{}}).list` (`classes-page.tsx:246`); params default `{limit:100}`. Response: `classes[]` mapped to `ClassItem`. States: `isPending`, `isError` (`:571-572`).
- Create class (`dialog/create-class-modal.tsx`):
  - **GET `/classes/generate-code`** (`:158`, `generateCodeOptions.enabled = open`). Response `{code}` -> `code` string.
  - **GET `/curriculum`** via `useCurriculumActions({...}).list` (`:167`) for curriculum picker.
  - **POST `/classes`** (`:304`, `create.mutateAsync`): payload `{ code, tutorId, name, subject, description?, tuition, maxStudents (1 or 10), format, location?, curriculumId?, startTime?, endTime? }`. Response `unwrapApiData(...).id` used for next step.
  - **POST `/schedules/bulk`** (`:334`, `createBulk.mutateAsync`): payload `{ classId, schedules: [{dayOfWeek, startTime, endTime, format, location?}] }`, only when schedules exist.
  - Errors via `getErrorMessage` toast; `isSubmitting` state.
- Edit class (`dialog/edit-class-dialog.tsx`):
  - **GET `/curriculum`** (`:137`), **GET `/classes/:id/students`** (`:175`), **GET `/students`** with search param (`:186`).
  - **PUT `/classes/:id`** (`:228`), payload = form fields with `id`. `onSuccess` invalidates `["classes","list"]` (see section 6). `isPending` disables form.
- Delete class (`dialog/delete-class-dialog.tsx:23`): **DELETE `/classes/:id`** via `useClassActions().delete`; `mutate` + `isPending`.
- Create session dialog (`dialog/create-session-dialog.tsx:82`, used from class detail): **POST `/sessions`** payload (record of form fields incl. `classId`, `date`, `startTime`, `endTime`). `onSuccess` invalidates `["class-sessions", classId]`.
- Bearer on all.

### `/classes/[id]` (`components/classes/page/class-detail-page.tsx`)
- **GET `/classes/:id`** (`:133`, key `["class-detail", classId]`). Response `ClassDetailDto` (`enabled` only with id). States: loading/error (handled in page).
- **GET `/classes/:id/students`** (`:139`). Roster.
- **GET `/curriculum/lessons`** (`:162`). Lessons for curriculum tab.
- **GET `/sessions`** (`:185`). Class sessions list.
- **PUT `/sessions/:id`** via `useSessionActions().update` (`:125`) - status change menu. Body not traced.
- **PUT `/classes/:id`** via `useClassActions().update` (`:127`) - status change.
- Imports `ClassDetailWatchPage` (`:26`): the watch-view requests (below) are reachable from this route only if that view is rendered; render condition not traced.
- Watch view (`page/class-detail-watch-page.tsx`):
  - **GET `/classes/:id/watches`** (`:288`). Path not defined by any service; verify against backend.
  - **GET `/users/get-by-field`** `{field:"id", value: tutorId}` via `useUserActions({byField}).byField` (`:302`). Response `ApiUser[]`.
  - **GET `/classes/:id/materials`** (`:314`).
  - **GET `/tuitions`** via `useTuitionActions({list})` (`:360`).
  - **GET `/notifications`** via `useNotificationActions({list})` (`:374`).

### `/classes/[id]/curriculum` and `/classes/[id]/exercise` (`ClassMaterialsPage`, `components/classes/page/class-materials-page.tsx`)
- **GET `/classes/:id/materials`** (`:74`). `isLoading`, `error`, `refetch` used.
- File links: **GET `/upload/download`** `{key}` with `responseType: blob` (`components/classes/components/material-file-row.tsx:15`, `session-material-file-row.tsx:16`, `watch-curriculum-chapter.tsx:51`, `curriculum-file-chip.tsx:16`).

### `/classes/[id]/sessions/[sessionId]` (`SessionDetailPage`, `components/classes/page/session-detail-page.tsx`)
- **GET `/sessions/:id`** (`:160`, `["session-detail", sessionId]`). Response `StudentSessionDetail`.
- **GET `/curriculum/:curriculumId`** (`:183`). Curriculum for lesson picker.
- **GET `/attendances/session/:sessionId`** via `useAttendanceActions({sessionId}).list` (`:170`). Response `AttendanceRecord[]`.
- **PUT `/sessions/:id`** via `useSessionActions().update` (`:172`) and direct `axiosInstance.put` at `:315` (`{title, description, note, lessonId}`), `:336` and `:413` (`{[field]: next}` inline edits), `:391` (`payload`). Inline-edit states `saving`.
- **GET `/curriculum/lessons/:lessonId`** (`:362`) on lesson select.
- **PUT `/attendances`** via `useAttendanceActions().upsert` (`:436`). Payload `{ sessionId, studentId, present: boolean, note: string | null }`. States: per-student `savingAttendanceId`, `committed` map; toast on success/error.
- Bearer on all.

### `/classes/[id]/sessions/[sessionId]/exercise` (`ExerciseSubmitPage`, `page/exercise-submit-page.tsx`)
- **GET `/sessions/:id`** via `useSessionActions({detailId})` (`:158`).
- **GET `/exercises`** via `useExerciseActions({list:{sessionId, studentId,...}})` (`:164`). Response `data[]`.
- **GET `/users/get-by-field`** `{field:"id", value: tutorId}` (`:177`).
- **GET `/classes/:id/students`** via `useClassActions({studentsClassId})` (`:189`) roster.
- **GET `/attendances/session/:id`** (`:195`).
- **POST `/upload`** multipart `file` (`:214`); response `{url, key}` stored in `staged`. Uses `axiosInstance.post` with `Content-Type: multipart/form-data`.
- **PATCH `/exercises/:id/submit`** (`:265`) if a submission already exists (resubmit).
- **POST `/exercises`** (`:269`) payload `{ studentId, sessionId, lessonId?, ...files }` for a new submission.
- States: `uploading` (drop zone disabled), `exerciseLoading`, `submitting`. Toasts on upload/submit.

### `/classes/[id]/sessions/[sessionId]/submissions` (`SessionSubmissionsPage`)
- **GET `/sessions/:id`** (`session-submissions-page.tsx:95`), **GET `/classes/:id/students`** (`:106`), **GET `/exercises`** (`:119`, params `{sessionId}`-style; list not fully traced). Response consumed for per-student status. File links via `GET /upload/download` (`components/sessions/session-shared.tsx:117`).

### `/classes/[id]/sessions/[sessionId]/submissions/[exerciseId]` (`ExerciseGradePage`)
- **GET `/sessions/:id`** (`exercise-grade-page.tsx:59`), **GET `/classes/:id/students`** (`:69`), **GET `/exercises`** (`:81`).
- **POST `/upload`** for teacher annotation files (`components/classes/components/exercise-grade-workspace.tsx:215`).
- **PATCH `/exercises/:id/grade`** via `useExerciseActions().grade` (`exercise-grade-workspace.tsx:232`, `mutateAsync` at `:245`). Payload `GradeExercisePayload` (fields not traced).

### `/curriculum` (`CurriculumListPage`, `components/curriculum/page/curriculum-list-page.tsx`)
- **GET `/curriculum`** `params` (page, limit, search) (`:129`). Response `CurriculumFrameworksApiPayload.curriculums` via `select`. States: list loading/empty (not fully traced).
- **GET `/curriculum/generate-code`** (`components/curriculum/dialog/curriculum-form-dialog.tsx:157`, key `["curriculum-generate-code"]`). Response: string.
- **POST `/curriculum`** (`curriculum-form-dialog.tsx:173`, `createMutation`) and **PUT `/curriculum/:id`** (`:190`, `updateMutation`). Payload `CurriculumPayload`.
- **DELETE `/curriculum/:id`** (`components/curriculum/dialog/delete-curriculum-dialog.tsx:23`, `useDelete`). `isPending` disables button.

### `/curriculum/[id]` (`CurriculumDetailPage`, `components/curriculum/page/curriculum-detail-page.tsx`)
- **GET `/curriculum/:id`** (`:43`, `useGet<unknown>`). Renders chapters/lessons; `isLoading`/`isError` handled.
- **DELETE `/chapter/:id`** (`:60`, `axiosInstance.delete`).
- **POST `/chapter/:frameworkId`** (`components/curriculum/dialog/create-chapter-dialog.tsx:37`), body `{ title, ... }`.
- **POST `/curriculum/lessons?curriculumId=…&chapterId=…`** with `{ title, … }` to add a lesson (`components/curriculum/components/chapter-section.tsx:40-46`).
- **DELETE `/curriculum/lessons/:id`** (`chapter-section.tsx:68`).
- **PUT `/curriculum/lessons/:id/add-theory`** or **/exercises** multipart `file` (`components/curriculum/components/lesson-row.tsx:43`).
- **DELETE `/curriculum/lessons/:id/add-theory|exercises`** with body `{ url }` (`lesson-row.tsx:63`).
- **GET `/upload/download`** (`components/curriculum/components/file-row.tsx:16`).

### `/discussions` (`components/discussions/discussions-page.tsx`)
- **GET `/chat/conversations`** via `useConversations()` (`hooks/useChat.hook.ts:46`). Response `Conversation[]` (`data`). States: `isLoadingConversations` skeleton; empty list.
- **GET `/chat/conversations/:id/messages?limit=50`** via `useMessages(activeId)` (`useChat.hook.ts:66`), enabled when a conversation is selected. States: `isLoadingMessages`.
- **GET `/chat/users`** via `useChatableUsers()` (`:145`). States: `isLoadingUsers`.
- **POST `/chat/conversations/direct`** `{ targetUserId }` via `useCreateDirectConversation` (`:79`, `mutateAsync` at `discussions-page.tsx:333`); invalidates `["conversations"]`.
- **POST `/chat/conversations/:id/read`** via `useMarkAsRead` (`:112`, `discussions-page.tsx:282`).
- Socket `/chat` (`hooks/useChatSocket.hook.ts`): emits `conversation:join`, `conversation:leave`, `message:send {conversationId, content}`, `typing:start`, `typing:stop`, `message:read {conversationId, messageId}`; listens `message:receive`, `typing:start`, `typing:stop`, `user:status`.
- Online status from `useUserStatus` (socket provider).
- Unread total computed from `conversations[].unreadCount` (`:310`). `useUnreadCounts` (`GET /chat/unread`) is not used by this page.

### `/fees` (`components/fees/fees-page.tsx`, `family-fees-page.tsx`)
- **GET `/tuitions`** `{limit:100}` via `useTuitionActions({list}).list` (`fees-page.tsx:76`). Response `TuitionsResponse`. States: `isLoading`, `isError` (`:95-96`).
- **GET `/classes`** `{limit:100}` (`fees-page.tsx:82`, class filter).
- **POST `/tuitions`** (`components/fees/create-tuition-dialog.tsx:80/104`), payload with class/student/amount fields. Uses **GET `/classes/:classId/students`** (`:54`) to fill students.
- **PUT `/tuitions/:id`** (`components/fees/tuition-detail-dialog.tsx:54/80`).
- Family view (`family-fees-page.tsx:65`): **GET `/students`** via `useStudentActions({list})`, then `useTuitionActions({list:{limit:100}}).list` (`:82`).
- `tuition-pay-dialog.tsx` has no request (payment UI only).

### `/grades` (`components/grades/grades-page.tsx`)
- **GET `/classes/:id/students`** (`:180`, `enabled: !!classId`).
- **GET `/sessions`** (`:191`).
- **GET `/exercises`** with `{classId, limit:100}` (`:209`).
- **GET `/curriculum/by-grade/:gradeId`** (`:484`).
- **GET `/exercises`** for tutor view (`:608`, key `["tutor-exercises", tutorId]`), and again `:831`.
- **GET `/classes`** (`:849`).
- **GET `/users/grades`** via `useUserActions().userGrades` (`:827`, `components/grades/grades-page.tsx`).
- Also imports `components/practice/student-assignments-view.tsx` which calls `useSessionActions({list:{limit:100}})` and `useExerciseActions` (`practice/student-assignments-view.tsx:123,130`).
- States: `*Loading` flags for exercises/sessions; list loading/empty not fully traced.

### `/investments` (NOT REAL API)
- `HOLDINGS` (`components/investments/investments-page.tsx:24`), `PERFORMANCE_VALUES` (`:162`) and `MONTHS` are hard-coded. No requests.

### `/logger` (admin) (`components/logger/logger-page.tsx`)
- **GET `/logs`** via `useLogActions({list: listParams}).list` (`:64`). Params `{page, limit, serviceName?, type?, correlationId?, search?}`. Response `RequestLogsApiPayload`.
- **GET `/logs/trace/:correlationId`** via `trace` (enabled when a row is selected and not held for live run) (`:64-67`). Response `ApiRequestLog[]` (waterfall).
- **GET `/logs/stats`** via `stats` (`:70`). Response `EndpointStats[]` (calls/24h, P95).
- **GET `/test-scenarios`** via `useTestScenarioActions({list:true, metaOptions:{enabled:false}})` (`:71`), used to pick the scenario for a request.
- **POST `/test-scenarios/:id/run?async=true`** via `runRealtime.mutate` (`:131`). Response `{correlationId}` -> `liveTrace.start`.
- Socket `/logs` (`hooks/useLogSocket.hook.ts:36`, namespace `/logs` on port 4000 by default, `auth: {token}`): listens `log:new`. Connected only while the page is mounted.
- Request detail dialog (`components/logger/request-detail-dialog.tsx`) uses `useTracePlayback` (no request).
- States: `isLoading`/`isError` for logs list (not fully traced).

### `/notifications` (`app/(app)/notifications/page.tsx`)
- **GET `/notifications`** via `useNotificationActions({list: params})` (`:205`), params `{page, limit, search?, type?}`. Response normalized to `{data[], pagination{total,page,limit,totalPages}}` (handles bare array). Reads `apiPayload.data`, `pagination`. States: `isPending` skeleton (`:334`), `isError` banner (`:345`), empty (`:434`), pagination.
- **PATCH `/notifications/:id/read`** via `markRead.mutate` (`:245` and `:491`); body `undefined`. Success invalidates list.
- `markAllRead` (PATCH `/notifications/read-all`) is defined in `notification.service.ts` but **not called** by this page.

### `/notifications/[id]` (`app/(app)/notifications/[id]/page.tsx`)
- **GET `/notifications/:id`** via `useNotificationActions({detailId}).detail` (`:43`). Fields read: `type`, `title`, `content`, `subContent`, `isRead`, `createdAt`, `redirectUrl`(not traced). States: `isLoading` (`:59`), `error`, not-found view (not traced).
- **PATCH `/notifications/:id/read`** via `markRead.mutate` (`:49`) when opened. Toast on success/error.

### `/practice-exams`, `/practice-exams/[id]`, `/practice-exams/[id]/result` (NOT REAL API)
- Static data in `components/practice-exams/practice-exams.data.ts`, `practice-exam-take.data.ts`, `practice-exam-result.data.ts`. No requests. Take/result pages keep state locally.

### `/reports` (`components/reports/reports-page.tsx`) - ADMIN only (`enabled: isAdmin`)
- **GET `/reports/learning/summary`** (`:69`). Response `LearningReportSummary`. States: `isLoading`, `isError`.
- **GET `/reports/learning/attendance-trend`** (`:80`). Response `AttendanceTrendPoint[]`. State: `isLoading`.
- **GET `/reports/learning/classes`** with `{page, limit: PAGE_SIZE, search?}` (`:100`). Response `ClassReportsApiPayload` (`data[]`, `pagination.totalPages`). States: `isPending`, `isError`.

### `/schedule` (`app/(app)/schedule/page.tsx`)
- **GET `/sessions`** `{limit:100}` via `useSessionActions({list}).list` (`:408`). Response `sessions[]`. States: `isLoading` (`:684`), `isError` (`:691`), month/week/day views. Contains `console.log` debug output (`:415-416`).
- Form dialog `components/schedule/schedule-form-dialog.tsx`:
  - **GET `/classes`** `{limit:100}` when dialog open (`:116`) for class picker.
  - **POST `/sessions`** via `create` (`:161`), payload `{ classId, title?, date, startTime, endTime, location?, description? }`. The computed `startAt`/`endAt` ISO strings (`:136-137`) are **not** sent.
  - **PUT `/sessions/:id`** via `update` (`:147`) (`useSessionActions().update` is a `usePut`).
- `components/schedule/delete-schedule-dialog.tsx:30`: **DELETE `/sessions/:id`** via `useSessionActions().delete`.

### `/sessions` and `/sessions/[id]`
- `/sessions` (`components/sessions/student-sessions-page.tsx:135`): **GET `/sessions`** `{page:1, limit:10}` via `useSessionActions({list}).list`. Response `StudentSessionsResponse`. Loading/error states handled.
- `/sessions/[id]` (`components/sessions/session-detail-view.tsx`, role-dependent view; `student-session-detail.tsx`):
  - **GET `/curriculum/lessons`** `{curriculumId, limit:100}` via `useLessonActions({list})` (`session-detail-view.tsx:246`).
  - **GET `/sessions/:id`** via `useSessionActions({detailId})` (`:378`; `student-session-detail.tsx:103`).
  - **PATCH `/sessions/:id`** (`session-detail-view.tsx:281`, `:393`) - status change. Body not traced.
  - **GET `/users/get-by-field`** `{field:"id", value: tutorId}` (`:415`).
  - **GET `/classes/:id/students`** via `useClassActions({studentsClassId})` (`:428`, only when `needRoster`).
  - **GET `/attendances/session/:id`** (`:450`, STUDENT and PARENT views).
  - **GET `/exercises`** `{sessionId, studentId, limit:1}` (`student-session-detail.tsx:110`).
  - **POST `/upload`** (`student-session-detail.tsx:131`), **PATCH `/exercises/:id/submit`** (`:163`), **POST `/exercises`** (`:167`) - student submission.
  - **GET `/upload/download`** (`components/sessions/session-shared.tsx:117`).

### `/settings` (`app/(app)/settings/page.tsx`)
- **GET `/users/detail-user`** (`:1870`, `apiGet`, refetch on mount; `catch` silent).
- **POST `/users/avatar`** multipart `avatar` (`:767`). Response `{avatar}` -> `setUser`.
- **PUT `/users`** `{avatar: null}` (`:792`) to remove avatar.
- **PUT `/users`** profile payload `UpdateUserPayload` (`:812`); `firstName`/`lastName` excluded when name is locked.
- **POST `/users/change-password`** `{currentPassword, newPassword}` via `useUserActions().changePassword` (`:1163`, `mutate` + `isPending`).
- **GET `/curriculum/grades`** via `useUserActions().allGrades` (`:1545`) and **GET `/users/grades`** via `userGrades` (`:1547`). States: `allLoading`, `userGradesLoading`.
- **PUT `/users/grade`** `{gradesId: string[]}` (`:1573`).
- Parent view: **GET `/students`** `{page:1, limit:100}` via `useStudentActions({list}).list` (`:696`), enabled only when role is PARENT; filters `parentId === viewerId` client-side (linked children).
- Bearer on all.

### `/students` (`app/(app)/students/page.tsx`)
- **GET `/classes`** `{limit:100}` via `useClassActions({list}).list` (`:130`) for class tabs and filter options.
- **GET `/students`** with params `{page, limit, search?, classCode?, classId?, gender?, isActive?}` via `useStudentActions({list: queryParams}).list` (`:199`). Response `students[]` (mapped via `mapApiToStudent`), `pagination.totalPages`. States: `isPending`, `isError` (with `getErrorMessage`).
- **DELETE `/students/:id`** via `deleteStudent.mutate` (`:224`); invalidates list, toast.
- Add dialog (`components/students/add-student-dialog.tsx`):
  - **GET `/students/get-student-code`** via `useStudentActions().generateCode` (`:87`).
  - **GET `/classes`** `{limit:100}` (`:98`).
  - **POST `/students`** (`:114`, `usePost`) payload `CreateStudentPayload` incl. `classCode?`. `isPending` disables form.
- Edit dialog (`components/students/edit-student-dialog.tsx`):
  - **GET `/classes`** (`:158`).
  - **PUT `/students/:id`** (`:175`) payload `UpdateStudentPayload`; always sends `classId` (`""` allowed to unassign, `:196`).

### `/students/[id]` (`app/(app)/students/[id]/page.tsx`)
- **GET `/students/:id`** via `useStudentActions({detailId})` (`:135`). Response `ApiStudent`. States: `isLoading: studentLoading` (`:133`).
- **GET `/exercises`** `{studentId, limit:100}` via `useExerciseActions({list})` (`:145`). `isLoading: exercisesLoading`. Used for the Scores tab.
- Edit: **PUT `/students/:id`** via `EditStudentDialog` (see `/students`).
- Sessions tab shows an empty-state text (`:489`) based on local data.

### `/test-monitor` (admin) (`components/test-monitor/test-monitor-page.tsx`)
Mock switch: `useTestMonitorMock()` (`hooks/useTestMonitorMock.hook.ts`) reads `NEXT_PUBLIC_TEST_MONITOR_MOCK=true` or `?mock=1`. In mock mode, all queries/mutations below are disabled and the page reads `test-monitor-mock-data.ts` (**NOT REAL API**).
- **GET `/test-scenarios`** via `useTestScenarioActions({list:true})` (`test-monitor-page.tsx:107`). Response: each case with latest run.
- **GET `/test-scenarios/stats`** (`stats: true`). Cases passed/total per endpoint.
- **GET `/test-scenarios/routes`** (`routes: true`). Every gateway route.
- **GET `/test-scenarios/meta`** (`metaOptions`, `retry:false`). Environment name.
- **GET `/test-scenarios/:id/runs`** (`runsScenarioId`, history dialog).
- **GET `/test-scenarios/fixtures`** and **GET `/test-scenarios/auth-profiles`** via `hooks/useTestFixtures.hook.ts:21`.
- **POST `/test-scenarios/:id/run`** via `run.mutate` / `mutateAsync` (`test-monitor-page.tsx:202`, `:225`). Settled run refreshes list/stats/runs.
- **POST `/test-scenarios/generate`** (`:269`) - proposals only. Payload `GenerateScenariosPayload`.
- **POST `/test-scenarios/bulk`** `{ scenarios: CreateTestScenarioPayload[] }` (`:296`).
- **POST `/test-scenarios`** (`:338`) create and **PATCH `/test-scenarios/:id`** (`:337`) update (`usePatch`).
- **DELETE `/test-scenarios/:id`** (`:351`).
- Fixtures: **POST `/test-scenarios/fixtures`** (createFixture), **PATCH `/test-scenarios/fixtures/:id`** (updateFixture), **DELETE `/test-scenarios/fixtures/:id`** (deleteFixture), **POST `/test-scenarios/fixtures/:id/resolve`** (resolveFixture, payload = id string).
- Trace: **GET `/logs/stats`** via `useLogActions({stats:true})` (`:120`); **GET `/logs/trace/:correlationId`** via `hooks/useTestMonitorTrace.hook.ts:37`; socket `/logs` (`useLogSocket`).
- Realtime run: **POST `/test-scenarios/:id/run?async=true`** (`hooks/useTestMonitorTrace.hook.ts:41`).
- States: `isPending`/`isError` for list handled; mock fallback otherwise.

### `/tutors` (admin) (`components/tutors/tutors-page.tsx`)
- **GET `/admin/tutors`** `{page, limit, search?, isActive?}` via `useAdminTutors(params, role==="ADMIN")` (`hooks/useAdminUsers.hook.ts:30`; used at `tutors-page.tsx:84`). Response `AdminTutorsApiPayload`. States: `isPending`, `isError` + `refetch`.
- **POST `/admin/tutors`** via `useCreateTutor` (`components/tutors/add-tutor-dialog.tsx:86`, `mutate` at `:100`). Payload `CreateAdminUserPayload` incl. `subjects?`, `school?`, `gender`. Success toast + `onCreated`.
- Update/delete tutor hooks (`useUpdateTutor`, `useDeleteTutor`) exist but are not used.

### `/users` (admin) (`components/users/users-page.tsx`)
- **GET `/users`** via `useGet` (`users-page.tsx:124`), params `{page, pageSize, search, role/activeTab}`, `enabled: role==="ADMIN"`. Response `ManagedUsersApiPayload.data[]`. States: `isPending`, `isError` (`:124-131`).
- **DELETE `/users/:id`** (`:141`) via `useDelete`.
- **PUT `/users/:id/status`** `{isActive}` (`:149-152`, `toggleStatus`).
- **POST `/users`** (`components/users/create-user-dialog.tsx:71`, `createUser.mutate` at `:104`). Payload `CreateManagedUserPayload`.
- **PUT `/users/:id`** (`components/users/edit-user-dialog.tsx:94`, `updateUser.mutate` at `:115`). Payload `UpdateManagedUserPayload`.

### `/transactions` (NOT REAL API)
- `TRANSACTIONS` constant (`components/transactions/transactions-page.tsx:41`) and all stats are hard-coded. No requests.
- `useTransactionsList` in `components/transactions/transactions.data.ts:59` would call **GET `/transactions`**, **GET `/wallets`** and **GET `/categories`** (`{page:1,limit:100}`), but **nothing imports it**, so it is unused dead code.

### `/login` (`components/auth/login-form.tsx`)
- **POST `/auth/login`** `{ email, password }` (admin role, or identifier containing `@`) (`:99-113` mutate; hook `useAuthActions().login` in `lib/services/auth.service.ts`).
- **POST `/auth/login/user-code`** `{ userCode, password, role: "STUDENT"|"PARENT" }` (student/parent with non-email identifier).
- Response: `pickAccessToken` / `pickRefreshToken` -> saved to zustand + localStorage (`:74-86`), then `router.replace("/")`. Error: `handleLoginError`. `isPending` disables form. No Bearer (login excluded from refresh).
- Google/Facebook buttons: full navigation to `${API_BASE_URL}/auth/google|facebook` (`lib/oauth.ts`), not a fetch.

### `/register` (`components/auth/register-form.tsx`)
- **POST `/auth/register`** `{ firstName, lastName, email, password, confirmPassword }` (`:59`). `onSuccess` -> `router.push("/login")`. Errors mapped to form fields via `handleFormApiError`. Google/Facebook as above.

### `/forgot-password` (`components/auth/forgot-pass.tsx`)
- **POST `/auth/forgot-password`** `{ email }` (`:45`, resend at `:78`). Success shows "sent" screen. Errors via mutation handlers.

### `/reset-password` (`components/auth/reset-pass.tsx`)
- **POST `/auth/reset-password`** `{ jti, password, confirmPassword }` (`:48`). `jti` is the `token` query param (`:24`). `onSuccess` -> `done` screen; errors mapped to fields.

### `/oauth/callback` (`components/auth/oauth-callback.tsx`)
- No request. Reads `accessToken` and `refreshToken` from the query string (`:24-25`), stores them via `setAuthTokens` and `router.replace("/")`. Missing token -> `/login?error=oauth_failed`. Tokens in the URL are a security consideration.

### `/flow-request` (NOT REAL API)
- `components/flow-request/flow-request.data.ts` and `flow-request-seed-data.ts` are static. No requests in the flow-request components.

### `/flow-requests` (`components/flow-requests/flow-request-diagram.tsx`)
- **GET `/flow-requests`** `{page:1, limit:1000}` via `useFlowRequestActions({list}).list` (`:187`). Response `flowRequests[]`. Code comment says this endpoint is 404 on the backend; when `isError` or the list is empty, the page renders `SEED_FLOW_REQUESTS` (static, `:198-199`). States: `isPending` (`:327`).
- **PUT `/flow-requests/:id`** via `update.mutate` (`:292`).
- **DELETE `/flow-requests/:id`** via `del.mutate` (`:316`).
- `components/flow-requests/add-flow-request-dialog.tsx:54/69`: **POST `/flow-requests`** payload `CreateFlowRequestPayload`.
- `components/flow-requests/edit-flow-request-dialog.tsx:70/88`: **PUT `/flow-requests/:id`** payload `UpdateFlowRequestPayload`. (Not reached from the diagram page's `update` if the page only uses diagram-level update; both exist.)

---

## 5. Unused API client functions

Defined in `lib/` or `hooks/` and not called from any page or component (grep over `app/`, `components/`, `hooks/`, `lib/`, `zustand/`):

| Function | Defined at | Notes |
|---|---|---|
| `apiGetCurrentUser` | `lib/services/user.service.ts:26` | unused (GET `/users/detail-user`; page uses `apiGet` directly) |
| `apiUploadAvatar` | `lib/services/user.service.ts:31` | unused (settings uses inline `axiosInstance.post("/users/avatar")`) |
| `apiUpdateProfile` | `lib/services/user.service.ts:42` | unused (settings uses inline `PUT /users`) |
| `apiUpdateUserGrades` | `lib/services/user.service.ts:52` | unused (settings uses inline `PUT /users/grade`) |
| `apiUploadFile` | `lib/services/student.service.ts:21` | unused (POST `/upload`; pages inline it) |
| `apiDownloadFile` | `lib/services/student.service.ts:32` | unused (GET `/upload/download`; pages inline it) |
| `apiUploadLessonFile` | `lib/services/lesson.service.ts:20` | unused (PUT `/curriculum/lessons/:id/add-theory|exercises`; pages inline it) |
| `useChapterActions` (whole hook: list, detail, create, update, delete) | `lib/services/chapter.service.ts` | unused; chapter calls are inline in `curriculum-detail-page.tsx` |
| `useScheduleActions` except `createBulk` | `lib/services/schedule.service.ts` | only `createBulk` used (`create-class-modal.tsx:161`); `list`, `byClass`, `detail`, `create`, `update`, `delete` unused |
| `useSessionActions().byClass` | `lib/services/session.service.ts` | unused (GET `/sessions/class/:id`) |
| `useClassActions().enrollStudents` | `lib/services/class.service.ts` | unused (POST `/classes/:id/students`) |
| `useNotificationActions().markAllRead` | `lib/services/notification.service.ts` | unused (PATCH `/notifications/read-all`) |
| `useAdminStudents`, `useCreateStudent`, `useUpdateStudent`, `useDeleteStudent` | `hooks/useAdminUsers.hook.ts:64-94` | unused (`/admin/students`) |
| `useUpdateTutor`, `useDeleteTutor` | `hooks/useAdminUsers.hook.ts:48,58` | unused (`/admin/tutors/:id`) |
| `useUnreadCounts` | `hooks/useChat.hook.ts:126` | unused (GET `/chat/unread`) |
| `useConversation` | `hooks/useChat.hook.ts:55` | unused (GET `/chat/conversations/:id`) |
| `useCreateGroupConversation` | `hooks/useChat.hook.ts:95` | unused (POST `/chat/conversations/group`) |
| `hooks/useQuery.hook.ts` (`useGet`, `usePost`, `usePut`, `usePatch`, `useDelete`, `apiGet`, `apiPost`, `apiPut`, `apiPatch`, `apiDelete`) | `hooks/useQuery.hook.ts` | duplicate of `lib/axios/query.ts`; only re-exported via `hooks/index.ts`, no consumer uses these exports |
| `useApiQuery`, `useApiMutation` (aliases) | `lib/axios/query.ts` (end of file) | unused aliases |

Partly used (members not verified as used): `useLessonActions` (only `list` seen, used by session detail), `useFlowRequestActions` (`detail`, `delete` used; `create` used by dialog), `useTuitionActions().summary`, `useCurriculumActions().list` (used by create-class-modal; detail/update/delete not verified), `useClassActions().detail/students`.

---

## 6. Unclear / not verified

1. **Backend existence not checked.** This review is UI-only. Paths that no `lib/services` file defines and that the backend may not expose: `/classes/:id/watches`, `/classes/:id/materials`, `/categories`, `/reports/learning/*`, `/logs/*`, `/test-scenarios/*`, `/admin/tutors`, `/chat/*`, `/flow-requests` (its own comment says 404), `/users/get-by-field`, `/users/grades`, `/students/get-student-code`, `/curriculum/by-grade/:id`, `/curriculum/lessons/by-curriculum/:id`, `/sessions/class/:id`. The API spec docs were intentionally not treated as truth.
2. **Suspicious paths (likely bugs, not confirmed against backend):**
   - `components/classes/components/curriculum-lesson-row.tsx:71` uses `DELETE /lesson/:id/add-theory|exercises` (singular `/lesson`) while the same feature elsewhere uses `/curriculum/lessons/...`. Also `:51` uses `/curriculum/lessons/:id/theory` (not `add-theory`).
   - `components/classes/components/curriculum-chapter-row.tsx:74` posts `POST /lesson?curriculumId=${chapter.id}&chapterId=${chapter.id}`: the same `chapter.id` is passed as both `curriculumId` and `chapterId`, and the path is singular `/lesson`.
   - `components/classes/page/curriculum-page.tsx:50,63` uses `GET /curriculum/:classId` and `DELETE /curriculum/:chapterId`; chapter deletes elsewhere use `DELETE /chapter/:id`.
3. **Query invalidation mismatch.** `components/classes/dialog/edit-class-dialog.tsx` invalidates `["classes","list"]`, but `useClassActions({list})` keys are `["classes", <params object>]`. Partial matching compares `"list"` to the params object, so the classes list is likely not refreshed after edit. Not verified at runtime.
4. **`redirectIfAuthenticated`** (`lib/axios/auth-redirect.ts`) reads cookies `access_token`/`accessToken`, but no code sets cookies and there is no `middleware.ts`. Server-side redirects from `/login`, `/register`, `/forgot-password`, `/reset-password` probably never fire. Verify whether the gateway sets such cookies.
5. **Schedule form** computes `startAt`/`endAt` (`schedule-form-dialog.tsx:136-137`) but does not send them. Intent unclear.
6. **Response/payload shapes** for several calls were not fully traced: `PATCH /sessions/:id` body (`session-detail-view.tsx:281,393`), `PATCH /exercises/:id/grade` (`GradeExercisePayload`), `POST /classes/:id` related `ClassDetailDto`, `GET /classes/:id/watches` response, `POST /tuitions` body, `POST /flow-requests` body, and the list/empty states of `curriculum-list-page`, `grades-page`, `fees-page`, and `logger` list.
7. **Route visibility not verified.** `ClassDetailPage` imports `ClassDetailWatchPage`, `SessionDetailWatchPage` and `session-detail-watch-page.tsx` exist, but their rendering conditions were not traced. Their requests are listed under the parent route only as possible.
8. **`/sessions/[id]` role split.** `SessionDetailView` and `StudentSessionDetail` are both reachable; the exact branch per role was not traced line by line.
9. **Dead route groups.** `(tutor)`, `(parent)`, `(student)` layouts wrap no pages, so their `RoleGuard`s never run.
10. **`app/(app)/root.layout.tsx`** (imported by `app/(app)/layout.tsx`) mounts `AiAnalysisWidget` on every app page. Its send path (`POST /ai-chat/chat`) is therefore reachable app-wide, not only from `/ai-chat`.
11. **Hard-coded data** pages (`/accounts`, `/analytics`, `/budgets`, `/investments`, `/transactions`, `/practice-exams*`, `/flow-request`) were judged static from the code. No request was found, but these were not exhaustively searched for hidden `fetch` calls.
12. **Auth token storage** is in zustand `auth-store` (persisted) and localStorage (`accessToken`, `refreshToken`). OAuth tokens are passed in the callback URL query string (`/oauth/callback`).
13. `hooks/useCurrentUserId.ts` and `hooks/useCurrentUserRole.ts` decode the JWT payload client-side (no verification). Not a request, but relevant to authorization display.
14. Socket connections: `/chat` (`components/providers/socket.provider.tsx:39`) is opened for every authenticated session via `SocketProvider` in `app/layout.tsx`. `/logs` is opened only on logger/test-monitor pages.
