# TUTOR-UI to Backend API Gap Report

Date: 2026-10-10. Scope: every UI request listed in `docs/api-review/ui-pages.md`, re-checked against TUTOR-UI source, matched to the gateway (the only backend the UI calls, `API_BASE_URL` default `http://localhost:8888`) and to the downstream handlers the gateway forwards to. Read-only; no source file was modified.

## Method notes

- Path notation: `gw` = `gateway/src/features/`, `usr` = `USER/src/features/`, `tsvc` = `tutor-service/src/features/`, `third` = `THIRD_SERVICE/src/features/`. Gateway controller prefixes applied; no global prefix (`gateway/src/main.ts`).
- Gateway routes were extracted from every `@Controller`/`@Get|Post|Put|Patch|Delete` decorator. Each handler forwards with `rmqProducer.send(pattern)`; the pattern was matched to a `@MessagePattern` in `USER`, `tutor-service` or `THIRD_SERVICE` (rpc controllers). Gateway handlers that do not forward (`test-scenarios/routes` and `test-scenarios/meta`) are marked as local.
- Match key: method + path, with any `:param` segment treated as equal. Query strings are ignored for matching but checked where noted.
- Status: `OK` route exists and forwards to an existing handler; body/response shapes are noted, not diffed, unless a MISMATCH is stated. `MISMATCH` route exists but method, path or a verified param/body/response key differs. `MISSING` no gateway route. `MOCK` static data. `UNVERIFIED` cannot be confirmed statically.
- Counts are per row. The same endpoint can appear on several page sections, so rows are not unique call sites.
- Role check: gateway `@Roles('ADMIN')` exists on `admin`, `logs`, `reports/learning`, `test-scenarios` (`gw/*/controller.ts`), with a global JWT guard (`gw/app.module.ts:69-73`). Other gateway controllers (user, student, class, session, tuition, etc.) have no role decorator. USER `admin.controller.ts` and tutor-service `report.controller.ts` also carry an ADMIN `@Roles`; the USER and tutor-service rpc handlers do not check roles. Result: no page requires a role the backend enforces without the page checking it. The reverse holds for `/users*` (see unverified section).
- Downstream HTTP controllers (each on its own port) duplicate the gateway routes. The UI never calls them directly, so they are not listed as unused except where the gateway has no equivalent (chat and `/run`).

## Summary counts

| Status | Count |
|---|---|
| OK | 157 |
| MISSING | 22 |
| MISMATCH | 18 |
| MOCK | 9 |
| UNVERIFIED | 2 |
| **Total rows** | **208** |

Unused gateway routes: 43. Downstream-only HTTP routes with no gateway equivalent: 11.

Role flags: none where the backend requires a role and the page does not check it. Backend has no ADMIN check on `/users`, `/users/:id`, `/users/:id/status`, `/students*`, which the `/users` page relies on the client to guard.

# Per-page results

## (global)

Page file: `components/providers/auth.provider.tsx; lib/axios/auth-refresh.ts; components/ai-chat/ai-analysis-widget.tsx; components/providers/socket.provider.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| GET /users/detail-user | `components/providers/auth.provider.tsx:107` | gw/user/user.controller.ts:75 → usr/user/user.rpc.controller.ts:26 (user.getDetailUser) | OK | Session check on mount; also :139 after refresh |
| POST /auth/refresh | `lib/axios/auth-refresh.ts:29` | gw/auth/auth.controller.ts:176 → usr/auth/auth.rpc.controller.ts:42 (auth.refresh) | OK | Called on 401; no Bearer |
| POST /ai-chat/chat | `components/ai-chat/ai-analysis-widget.tsx:67` | gw/ai-chat/ai-chat.controller.ts:32 → tsvc/agents/agents.rpc.controller.ts:16 (ai.chat) | OK | AI widget mounted on every (app) page via root.layout |
| WS /chat (socket namespace) | `components/providers/socket.provider.tsx:39` | — | MISSING | Socket URL = NEXT_PUBLIC_API_URL (gateway :8888). Gateway has no WebSocket gateway; chat.gateway.ts (ns /chat) lives in tutor-service on its own port |

## /

Page file: `app/(app)/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| GET /dashboard/overview | `app/(app)/page.tsx:141` | gw/dashboard/dashboard.controller.ts:23 → tsvc/dashboard/dashboard.rpc.controller.ts:14 (dashboard.overview) | OK | Body/response not diffed |

## /accounts

Page file: `app/(app)/accounts/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| (static) | `components/accounts/accounts.data.ts:103` | — | MOCK | Static MOCK_ACCOUNTS / MOCK_TRANSACTIONS |

## /ai-chat

Page file: `app/(app)/ai-chat/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| POST /ai-chat/chat | `components/ai-chat/ai-chat.tsx:34` | gw/ai-chat/ai-chat.controller.ts:32 → tsvc/agents/agents.rpc.controller.ts:16 (ai.chat) | OK | Sends full history |

## /analytics

Page file: `app/(app)/analytics/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| (static) | `components/analytics/analytics-page.tsx:1` | — | MOCK | TOP_CATEGORIES and charts hard-coded |

## /budgets

Page file: `app/(app)/budgets/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| (static) | `components/budgets/budgets-page.tsx:14` | — | MOCK | MONTHLY constant; budgetItems in components/dashboard/budget-overview-card.tsx:7 |

## /categories

Page file: `app/(app)/categories/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| GET /categories | `components/categories/categories-page.tsx:180` | — | MISSING | No gateway controller, no tutor-service controller for categories |
| POST /categories | `components/categories/categories-page.tsx:198` | — | MISSING |  |
| PUT /categories/:id | `components/categories/categories-page.tsx:210` | — | MISSING |  |
| DELETE /categories/:id | `components/categories/categories-page.tsx:222` | — | MISSING |  |

## /classes

Page file: `app/(app)/classes/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| GET /classes | `components/classes/page/classes-page.tsx:246` | gw/class/class.controller.ts:75 → tsvc/class/class.rpc.controller.ts:36 (class.getAll) | OK | limit:100 |
| GET /classes/generate-code | `components/classes/dialog/create-class-modal.tsx:158` | gw/class/class.controller.ts:67 → tsvc/class/class.rpc.controller.ts:30 (class.generateCode) | OK |  |
| GET /curriculum | `components/classes/dialog/create-class-modal.tsx:167` | gw/curriculum/curriculum.controller.ts:69 → tsvc/curriculum/curriculum.rpc.controller.ts:29 (curriculum.getAll) | OK | curriculum picker |
| POST /classes | `components/classes/dialog/create-class-modal.tsx:304` | gw/class/class.controller.ts:37 → tsvc/class/class.rpc.controller.ts:20 (class.create) | MISMATCH | UI sends maxStudents; not in gw createClassSchema (gw/packages/entities/class/class.schema.ts:6-34), silently dropped |
| POST /schedules/bulk | `components/classes/dialog/create-class-modal.tsx:334` | gw/schedule/schedule.controller.ts:50 → tsvc/schedule/schedule.rpc.controller.ts:25 (schedule.createBulk) | OK | Only when schedules exist |
| GET /curriculum | `components/classes/dialog/edit-class-dialog.tsx:137` | gw/curriculum/curriculum.controller.ts:69 → tsvc/curriculum/curriculum.rpc.controller.ts:29 (curriculum.getAll) | OK |  |
| GET /classes/:id/students | `components/classes/dialog/edit-class-dialog.tsx:175` | gw/class/class.controller.ts:116 → tsvc/class/class.rpc.controller.ts:51 (class.getStudents) | OK |  |
| GET /students | `components/classes/dialog/edit-class-dialog.tsx:186` | gw/student/student.controller.ts:114 → usr/user/user.rpc.controller.ts:21 (user.getUsers) | MISMATCH | Reads studentsPayload.students (edit-class-dialog.tsx:~196); Gateway returns {data,pagination} (usr/user/user.service.ts:60-80); UI reads `students` (types StudentsApiPayload). Gateway schema (gw/packages/entities/student/student.schema.ts:42-54) drops classCode/classId, no role filter |
| PUT /classes/:id | `components/classes/dialog/edit-class-dialog.tsx:228` | gw/class/class.controller.ts:50 → tsvc/class/class.rpc.controller.ts:25 (class.update) | OK |  |
| DELETE /classes/:id | `components/classes/dialog/delete-class-dialog.tsx:23` | gw/class/class.controller.ts:146 → tsvc/class/class.rpc.controller.ts:66 (class.delete) | OK |  |
| POST /sessions | `components/classes/dialog/create-session-dialog.tsx:82` | gw/session/session.controller.ts:37 → tsvc/session/session.rpc.controller.ts:20 (session.create) | OK | Sends startAt/endAt (create-session-dialog.tsx:120-130) |

## /classes/[id]

Page file: `app/(app)/classes/[id]/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| GET /classes/:id | `components/classes/page/class-detail-page.tsx:133` | gw/class/class.controller.ts:93 → tsvc/class/class.rpc.controller.ts:41 (class.getById) | OK |  |
| GET /classes/:id/students | `components/classes/page/class-detail-page.tsx:139` | gw/class/class.controller.ts:116 → tsvc/class/class.rpc.controller.ts:51 (class.getStudents) | OK |  |
| GET /curriculum/lessons | `components/classes/page/class-detail-page.tsx:162` | gw/lesson/lesson.controller.ts:49 → tsvc/lesson/lesson.rpc.controller.ts:27 (lesson.getAll) | UNVERIFIED | Probably shadowed by GET /curriculum/:id (gw/curriculum/curriculum.controller.ts:84); CurriculumModule is imported before LessonModule in gw/app.module.ts:45-47 |
| GET /sessions | `components/classes/page/class-detail-page.tsx:185` | gw/session/session.controller.ts:62 → tsvc/session/session.rpc.controller.ts:30 (session.getAll) | OK |  |
| PUT /sessions/:id | `components/classes/page/class-detail-page.tsx:125` | gw/session/session.controller.ts:104 → tsvc/session/session.rpc.controller.ts:45 (session.update) | OK | Body not traced |
| PUT /classes/:id | `components/classes/page/class-detail-page.tsx:127` | gw/class/class.controller.ts:50 → tsvc/class/class.rpc.controller.ts:25 (class.update) | OK | Status change |
| GET /classes/:id/watches | `components/classes/page/class-detail-watch-page.tsx:288` | gw/class/class.controller.ts:134 → tsvc/class/class.rpc.controller.ts:61 (class.getWatch) | OK | Watch view; rendering condition not traced |
| GET /users/get-by-field | `components/classes/page/class-detail-watch-page.tsx:302` | gw/user/user.controller.ts:89 → usr/user/user.rpc.controller.ts:31 (user.getUserByField) | OK | field=id, value=tutorId; id is searchable |
| GET /classes/:id/materials | `components/classes/page/class-detail-watch-page.tsx:314` | gw/class/class.controller.ts:125 → tsvc/class/class.rpc.controller.ts:56 (class.getMaterials) | OK |  |
| GET /tuitions | `components/classes/page/class-detail-watch-page.tsx:360` | gw/tuition/tuition.controller.ts:60 → tsvc/tuition/tuition.rpc.controller.ts:24 (tuition.getAll) | OK |  |
| GET /notifications | `components/classes/page/class-detail-watch-page.tsx:374` | gw/notification/notification.controller.ts:60 → third/notification/notification.rpc.controller.ts:20 (notification.getAll) | OK |  |

## /classes/[id]/curriculum

Page file: `app/(app)/classes/[id]/curriculum/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| GET /classes/:id/materials | `components/classes/page/class-materials-page.tsx:74` | gw/class/class.controller.ts:125 → tsvc/class/class.rpc.controller.ts:56 (class.getMaterials) | OK |  |
| GET /upload/download | `components/classes/components/material-file-row.tsx:15` | gw/upload/upload.controller.ts:94 → third/uploads/upload.rpc.controller.ts:36 (upload.download) | OK | blob download, key query |

## /classes/[id]/exercise

Page file: `app/(app)/classes/[id]/exercise/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| GET /classes/:id/materials | `components/classes/page/class-materials-page.tsx:74` | gw/class/class.controller.ts:125 → tsvc/class/class.rpc.controller.ts:56 (class.getMaterials) | OK | Same component as /curriculum |
| GET /upload/download | `components/classes/components/material-file-row.tsx:15` | gw/upload/upload.controller.ts:94 → third/uploads/upload.rpc.controller.ts:36 (upload.download) | OK |  |

## /classes/[id]/sessions/[sessionId]

Page file: `app/(app)/classes/[id]/sessions/[sessionId]/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| GET /sessions/:id | `components/classes/page/session-detail-page.tsx:160` | gw/session/session.controller.ts:95 → tsvc/session/session.rpc.controller.ts:40 (session.getById) | OK |  |
| GET /curriculum/:curriculumId | `components/classes/page/session-detail-page.tsx:183` | gw/curriculum/curriculum.controller.ts:84 → tsvc/curriculum/curriculum.rpc.controller.ts:34 (curriculum.getById) | OK |  |
| GET /attendances/session/:id | `components/classes/page/session-detail-page.tsx:170` | gw/attendance/attendance.controller.ts:29 → tsvc/attendance/attendance.rpc.controller.ts:15 (attendance.getBySession) | OK |  |
| GET /curriculum/lessons/:lessonId | `components/classes/page/session-detail-page.tsx:362` | gw/lesson/lesson.controller.ts:63 → tsvc/lesson/lesson.rpc.controller.ts:32 (lesson.getById) | OK |  |
| PUT /sessions/:id | `components/classes/page/session-detail-page.tsx:172` | gw/session/session.controller.ts:104 → tsvc/session/session.rpc.controller.ts:45 (session.update) | OK | Also direct PUT at :315, :336, :391, :413 (inline edits) |
| PUT /attendances | `components/classes/page/session-detail-page.tsx:436` | gw/attendance/attendance.controller.ts:41 → tsvc/attendance/attendance.rpc.controller.ts:20 (attendance.upsert) | OK | Body {sessionId,studentId,present,note} matches upsertAttendanceSchema |
| GET /upload/download | `components/classes/components/session-material-file-row.tsx:16` | gw/upload/upload.controller.ts:94 → third/uploads/upload.rpc.controller.ts:36 (upload.download) | OK |  |

## /classes/[id]/sessions/[sessionId]/exercise

Page file: `app/(app)/classes/[id]/sessions/[sessionId]/exercise/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| GET /sessions/:id | `components/classes/page/exercise-submit-page.tsx:158` | gw/session/session.controller.ts:95 → tsvc/session/session.rpc.controller.ts:40 (session.getById) | OK |  |
| GET /exercises | `components/classes/page/exercise-submit-page.tsx:164` | gw/exercise/exercise.controller.ts:48 → tsvc/exercise/exercise.rpc.controller.ts:25 (exercise.getAll) | OK |  |
| GET /users/get-by-field | `components/classes/page/exercise-submit-page.tsx:177` | gw/user/user.controller.ts:89 → usr/user/user.rpc.controller.ts:31 (user.getUserByField) | OK |  |
| GET /classes/:id/students | `components/classes/page/exercise-submit-page.tsx:189` | gw/class/class.controller.ts:116 → tsvc/class/class.rpc.controller.ts:51 (class.getStudents) | OK |  |
| GET /attendances/session/:id | `components/classes/page/exercise-submit-page.tsx:195` | gw/attendance/attendance.controller.ts:29 → tsvc/attendance/attendance.rpc.controller.ts:15 (attendance.getBySession) | OK |  |
| POST /upload | `components/classes/page/exercise-submit-page.tsx:214` | gw/upload/upload.controller.ts:42 → third/uploads/upload.rpc.controller.ts:26 (upload.upload) | OK | multipart field 'file' matches FileInterceptor('file') |
| PATCH /exercises/:id/submit | `components/classes/page/exercise-submit-page.tsx:265` | gw/exercise/exercise.controller.ts:78 → tsvc/exercise/exercise.rpc.controller.ts:35 (exercise.submit) | OK | Body not diffed (exerciseUrls[] per gw exercise.schema.ts:37) |
| POST /exercises | `components/classes/page/exercise-submit-page.tsx:269` | gw/exercise/exercise.controller.ts:36 → tsvc/exercise/exercise.rpc.controller.ts:20 (exercise.create) | OK | Body not diffed |

## /classes/[id]/sessions/[sessionId]/submissions

Page file: `app/(app)/classes/[id]/sessions/[sessionId]/submissions/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| GET /sessions/:id | `components/classes/page/session-submissions-page.tsx:95` | gw/session/session.controller.ts:95 → tsvc/session/session.rpc.controller.ts:40 (session.getById) | OK |  |
| GET /classes/:id/students | `components/classes/page/session-submissions-page.tsx:106` | gw/class/class.controller.ts:116 → tsvc/class/class.rpc.controller.ts:51 (class.getStudents) | OK |  |
| GET /exercises | `components/classes/page/session-submissions-page.tsx:119` | gw/exercise/exercise.controller.ts:48 → tsvc/exercise/exercise.rpc.controller.ts:25 (exercise.getAll) | OK |  |
| GET /upload/download | `components/sessions/session-shared.tsx:117` | gw/upload/upload.controller.ts:94 → third/uploads/upload.rpc.controller.ts:36 (upload.download) | OK |  |

## /classes/[id]/sessions/[sessionId]/submissions/[exerciseId]

Page file: `app/(app)/classes/[id]/sessions/[sessionId]/submissions/[exerciseId]/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| GET /sessions/:id | `components/classes/page/exercise-grade-page.tsx:59` | gw/session/session.controller.ts:95 → tsvc/session/session.rpc.controller.ts:40 (session.getById) | OK | File path per ui-pages (exercise-grade-page) |
| GET /classes/:id/students | `components/classes/page/exercise-grade-page.tsx:69` | gw/class/class.controller.ts:116 → tsvc/class/class.rpc.controller.ts:51 (class.getStudents) | OK |  |
| GET /exercises | `components/classes/page/exercise-grade-page.tsx:81` | gw/exercise/exercise.controller.ts:48 → tsvc/exercise/exercise.rpc.controller.ts:25 (exercise.getAll) | OK |  |
| POST /upload | `components/classes/components/exercise-grade-workspace.tsx:215` | gw/upload/upload.controller.ts:42 → third/uploads/upload.rpc.controller.ts:26 (upload.upload) | OK |  |
| PATCH /exercises/:id/grade | `components/classes/components/exercise-grade-workspace.tsx:232` | gw/exercise/exercise.controller.ts:92 → tsvc/exercise/exercise.rpc.controller.ts:40 (exercise.grade) | OK | Body (score 0-10, comment) not diffed |
| GET /upload/download | `components/sessions/session-shared.tsx:117` | gw/upload/upload.controller.ts:94 → third/uploads/upload.rpc.controller.ts:36 (upload.download) | OK |  |

## /curriculum

Page file: `app/(app)/curriculum/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| GET /curriculum | `components/curriculum/page/curriculum-list-page.tsx:129` | gw/curriculum/curriculum.controller.ts:69 → tsvc/curriculum/curriculum.rpc.controller.ts:29 (curriculum.getAll) | OK | Response shape not traced |
| GET /curriculum/generate-code | `components/curriculum/dialog/curriculum-form-dialog.tsx:157` | gw/curriculum/curriculum.controller.ts:35 → tsvc/curriculum/curriculum.rpc.controller.ts:18 (curriculum.generateCode) | OK |  |
| POST /curriculum | `components/curriculum/dialog/curriculum-form-dialog.tsx:173` | gw/curriculum/curriculum.controller.ts:43 → tsvc/curriculum/curriculum.rpc.controller.ts:24 (curriculum.create) | OK | Body not diffed |
| PUT /curriculum/:id | `components/curriculum/dialog/curriculum-form-dialog.tsx:190` | gw/curriculum/curriculum.controller.ts:93 → tsvc/curriculum/curriculum.rpc.controller.ts:39 (curriculum.update) | OK |  |
| DELETE /curriculum/:id | `components/curriculum/dialog/delete-curriculum-dialog.tsx:23` | gw/curriculum/curriculum.controller.ts:118 → tsvc/curriculum/curriculum.rpc.controller.ts:44 (curriculum.delete) | OK |  |
| GET /upload/download | `components/classes/components/curriculum-file-chip.tsx:16` | gw/upload/upload.controller.ts:94 → third/uploads/upload.rpc.controller.ts:36 (upload.download) | OK | Per ui-pages summary |

## /curriculum/[id]

Page file: `app/(app)/curriculum/[id]/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| GET /curriculum/:id | `components/curriculum/page/curriculum-detail-page.tsx:43` | gw/curriculum/curriculum.controller.ts:84 → tsvc/curriculum/curriculum.rpc.controller.ts:34 (curriculum.getById) | OK |  |
| DELETE /chapter/:id | `components/curriculum/page/curriculum-detail-page.tsx:60` | gw/chapter/chapter.controller.ts:83 → tsvc/chapter/chapter.rpc.controller.ts:39 (chapter.delete) | OK |  |
| POST /chapter/:frameworkId | `components/curriculum/dialog/create-chapter-dialog.tsx:37` | gw/chapter/chapter.controller.ts:33 → tsvc/chapter/chapter.rpc.controller.ts:19 (chapter.create) | OK | Gateway param is curriculumId; UI passes frameworkId (curriculum id). Body not diffed |
| POST /curriculum/lessons?curriculumId&chapterId | `components/curriculum/components/chapter-section.tsx:44` | gw/lesson/lesson.controller.ts:33 → tsvc/lesson/lesson.rpc.controller.ts:19 (lesson.create) | OK | Query keys match lesson.controller.ts:35-41 |
| DELETE /curriculum/lessons/:id | `components/curriculum/components/chapter-section.tsx:68` | gw/lesson/lesson.controller.ts:85 → tsvc/lesson/lesson.rpc.controller.ts:42 (lesson.delete) | OK |  |
| PUT /curriculum/lessons/:id/add-theory  or  /exercises | `components/curriculum/components/lesson-row.tsx:43` | — | MISSING | No gateway route for /curriculum/lessons/:id/{add-theory or exercises}. lib/services/lesson.service.ts:29-31 uses the same path |
| DELETE /curriculum/lessons/:id/add-theory  or  /exercises | `components/curriculum/components/lesson-row.tsx:63` | — | MISSING | No gateway route |
| GET /upload/download | `components/curriculum/components/file-row.tsx:16` | gw/upload/upload.controller.ts:94 → third/uploads/upload.rpc.controller.ts:36 (upload.download) | OK |  |

## /discussions

Page file: `app/(app)/discussions/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| GET /chat/conversations | `hooks/useChat.hook.ts:49` | — | MISSING | No chat controller in gateway. tutor-service/src/features/chat/chat.controller.ts exists but is only on tutor-service's own port |
| GET /chat/conversations/:id/messages | `hooks/useChat.hook.ts:71` | — | MISSING | Same as above |
| GET /chat/users | `hooks/useChat.hook.ts:149` | — | MISSING | Same as above |
| POST /chat/conversations/direct | `hooks/useChat.hook.ts:84` | — | MISSING | Same as above |
| POST /chat/conversations/:id/read | `hooks/useChat.hook.ts:117` | — | MISSING | Same as above |
| WS /chat (socket namespace) | `hooks/useChatSocket.hook.ts:1` | — | MISSING | Socket goes to gateway URL; no gateway WS gateway (see global row) |

## /fees

Page file: `app/(app)/fees/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| GET /tuitions | `components/fees/fees-page.tsx:76` | gw/tuition/tuition.controller.ts:60 → tsvc/tuition/tuition.rpc.controller.ts:24 (tuition.getAll) | OK | limit:100 |
| GET /classes | `components/fees/fees-page.tsx:82` | gw/class/class.controller.ts:75 → tsvc/class/class.rpc.controller.ts:36 (class.getAll) | OK |  |
| GET /classes/:id/students | `components/fees/create-tuition-dialog.tsx:54` | gw/class/class.controller.ts:116 → tsvc/class/class.rpc.controller.ts:51 (class.getStudents) | OK |  |
| POST /tuitions | `components/fees/create-tuition-dialog.tsx:104` | gw/tuition/tuition.controller.ts:35 → tsvc/tuition/tuition.rpc.controller.ts:19 (tuition.create) | OK | Body (classId, studentId, amount, dueDate...) not diffed |
| PUT /tuitions/:id | `components/fees/tuition-detail-dialog.tsx:80` | gw/tuition/tuition.controller.ts:85 → tsvc/tuition/tuition.rpc.controller.ts:39 (tuition.update) | OK |  |
| GET /students | `components/fees/family-fees-page.tsx:65` | gw/student/student.controller.ts:114 → usr/user/user.rpc.controller.ts:21 (user.getUsers) | MISMATCH | Reads studentsPayload.students (family-fees-page.tsx:72); Gateway returns {data,pagination} (usr/user/user.service.ts:60-80); UI reads `students` (types StudentsApiPayload). Gateway schema (gw/packages/entities/student/student.schema.ts:42-54) drops classCode/classId, no role filter |

## /grades

Page file: `app/(app)/grades/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| GET /classes/:id/students | `components/grades/grades-page.tsx:180` | gw/class/class.controller.ts:116 → tsvc/class/class.rpc.controller.ts:51 (class.getStudents) | OK |  |
| GET /sessions | `components/grades/grades-page.tsx:191` | gw/session/session.controller.ts:62 → tsvc/session/session.rpc.controller.ts:30 (session.getAll) | OK |  |
| GET /exercises | `components/grades/grades-page.tsx:209` | gw/exercise/exercise.controller.ts:48 → tsvc/exercise/exercise.rpc.controller.ts:25 (exercise.getAll) | OK | classId, limit:100 |
| GET /curriculum/by-grade/:gradeId | `components/grades/grades-page.tsx:484` | — | MISSING | No gateway route (3 segments; GET /curriculum/:id is 1 segment) |
| GET /exercises (tutor view) | `components/grades/grades-page.tsx:608` | gw/exercise/exercise.controller.ts:48 → tsvc/exercise/exercise.rpc.controller.ts:25 (exercise.getAll) | OK |  |
| GET /exercises (tutor view) | `components/grades/grades-page.tsx:831` | gw/exercise/exercise.controller.ts:48 → tsvc/exercise/exercise.rpc.controller.ts:25 (exercise.getAll) | OK |  |
| GET /classes | `components/grades/grades-page.tsx:849` | gw/class/class.controller.ts:75 → tsvc/class/class.rpc.controller.ts:36 (class.getAll) | OK |  |
| GET /users/grades | `components/grades/grades-page.tsx:827` | — | MISSING | No gateway route for GET /users/grades (useUserActions().userGrades, lib/services/user.service.ts:121) |
| GET /sessions (via student-assignments-view) | `components/practice/student-assignments-view.tsx:123` | gw/session/session.controller.ts:62 → tsvc/session/session.rpc.controller.ts:30 (session.getAll) | OK | Imported by grades page |
| GET /exercises (via student-assignments-view) | `components/practice/student-assignments-view.tsx:130` | gw/exercise/exercise.controller.ts:48 → tsvc/exercise/exercise.rpc.controller.ts:25 (exercise.getAll) | OK |  |

## /investments

Page file: `app/(app)/investments/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| (static) | `components/investments/investments-page.tsx:24` | — | MOCK | HOLDINGS, PERFORMANCE_VALUES hard-coded |

## /logger

Page file: `app/(app)/(admin)/logger/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| GET /logs | `components/logger/logger-page.tsx:64` | gw/log/log.controller.ts:29 → third/log/log.rpc.controller.ts:22 (log.query) | OK | ADMIN on both sides |
| GET /logs/trace/:correlationId | `components/logger/logger-page.tsx:64` | gw/log/log.controller.ts:46 → third/log/log.rpc.controller.ts:27 (log.trace) | OK |  |
| GET /logs/stats | `components/logger/logger-page.tsx:70` | gw/log/log.controller.ts:58 → third/log/log.rpc.controller.ts:32 (log.stats) | OK |  |
| GET /test-scenarios | `components/logger/logger-page.tsx:71` | gw/test-scenario/test-scenario.controller.ts:203 → third/test-scenario/test-scenario.rpc.controller.ts:32 (testscenario.list) | OK | ADMIN on both sides |
| POST /test-scenarios/:id/run?async=true | `components/logger/logger-page.tsx:131` | gw/test-scenario/test-scenario.controller.ts:284 → third/test-scenario/test-scenario.rpc.controller.ts:57 (testscenario.run) | OK |  |
| WS /logs (socket namespace, event log:new) | `hooks/useLogSocket.hook.ts:36` | Direct to THIRD_SERVICE (NEXT_PUBLIC_THIRD_SERVICE_URL, default :4000), not via gateway: third/log/log.gateway.ts:31-33 ns /logs | OK | Connects to THIRD_SERVICE directly; event name not traced |

## /notifications

Page file: `app/(app)/notifications/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| GET /notifications | `app/(app)/notifications/page.tsx:205` | gw/notification/notification.controller.ts:60 → third/notification/notification.rpc.controller.ts:20 (notification.getAll) | OK | Response normalized in page; ok |
| PATCH /notifications/:id/read | `app/(app)/notifications/page.tsx:245` | gw/notification/notification.controller.ts:94 → third/notification/notification.rpc.controller.ts:35 (notification.markAsRead) | OK | Also :491. read-all defined but not called |

## /notifications/[id]

Page file: `app/(app)/notifications/[id]/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| GET /notifications/:id | `app/(app)/notifications/[id]/page.tsx:43` | gw/notification/notification.controller.ts:85 → third/notification/notification.rpc.controller.ts:30 (notification.getById) | OK |  |
| PATCH /notifications/:id/read | `app/(app)/notifications/[id]/page.tsx:49` | gw/notification/notification.controller.ts:94 → third/notification/notification.rpc.controller.ts:35 (notification.markAsRead) | OK |  |

## /practice-exams

Page file: `app/(app)/practice-exams/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| (static) | `components/practice-exams/practice-exams.data.ts:1` | — | MOCK | Static data files |

## /practice-exams/[id]

Page file: `app/(app)/practice-exams/[id]/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| (static) | `components/practice-exams/practice-exam-take.data.ts:1` | — | MOCK | Static data; local state |

## /practice-exams/[id]/result

Page file: `app/(app)/practice-exams/[id]/result/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| (static) | `components/practice-exams/practice-exam-result.data.ts:1` | — | MOCK | Static data |

## /reports

Page file: `app/(app)/reports/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| GET /reports/learning/summary | `components/reports/reports-page.tsx:71` | gw/report/report.controller.ts:31 → tsvc/report/report.rpc.controller.ts:15 (report.summary) | OK | ADMIN on both sides; page enabled only when isAdmin |
| GET /reports/learning/attendance-trend | `components/reports/reports-page.tsx:83` | gw/report/report.controller.ts:42 → tsvc/report/report.rpc.controller.ts:20 (report.attendanceTrend) | OK |  |
| GET /reports/learning/classes | `components/reports/reports-page.tsx:100` | gw/report/report.controller.ts:53 → tsvc/report/report.rpc.controller.ts:25 (report.classList) | OK |  |

## /schedule

Page file: `app/(app)/schedule/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| GET /sessions | `app/(app)/schedule/page.tsx:408` | gw/session/session.controller.ts:62 → tsvc/session/session.rpc.controller.ts:30 (session.getAll) | OK | limit:100 |
| GET /classes | `components/schedule/schedule-form-dialog.tsx:116` | gw/class/class.controller.ts:75 → tsvc/class/class.rpc.controller.ts:36 (class.getAll) | OK |  |
| POST /sessions | `components/schedule/schedule-form-dialog.tsx:161` | gw/session/session.controller.ts:37 → tsvc/session/session.rpc.controller.ts:20 (session.create) | MISMATCH | UI sends {date,startTime,endTime}; gw createSessionSchema requires startAt/endAt (gw/packages/entities/session/session.schema.ts:23-40) -> 400. Form computes startAt/endAt (:136-137) but does not send them |
| PUT /sessions/:id | `components/schedule/schedule-form-dialog.tsx:147` | gw/session/session.controller.ts:104 → tsvc/session/session.rpc.controller.ts:45 (session.update) | MISMATCH | UI sends date/startTime/endTime; not in updateSessionSchema (session.schema.ts:68-), so time edits are silently dropped |
| DELETE /sessions/:id | `components/schedule/delete-schedule-dialog.tsx:30` | gw/session/session.controller.ts:118 → tsvc/session/session.rpc.controller.ts:50 (session.delete) | OK |  |

## /sessions

Page file: `app/(app)/sessions/page.tsx`. ui-pages lists detail-view requests for /sessions; they are rendered from components/sessions/* (same as /sessions/[id])

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| GET /sessions | `components/sessions/student-sessions-page.tsx:135` | gw/session/session.controller.ts:62 → tsvc/session/session.rpc.controller.ts:30 (session.getAll) | OK | page={1},limit=10 |
| GET /sessions/:id | `components/sessions/session-detail-view.tsx:378` | gw/session/session.controller.ts:95 → tsvc/session/session.rpc.controller.ts:40 (session.getById) | OK | Listed in ui-pages for /sessions (same components as detail) |
| GET /sessions/:id | `components/sessions/session-detail-view.tsx:378` | gw/session/session.controller.ts:95 → tsvc/session/session.rpc.controller.ts:40 (session.getById) | OK | Also student-session-detail.tsx:103 |
| PATCH /sessions/:id | `components/sessions/session-detail-view.tsx:281` | gw/session/session.controller.ts:104 → tsvc/session/session.rpc.controller.ts:45 (session.update) | MISMATCH | Gateway only defines PUT /sessions/:id (session.controller.ts:104); PATCH not defined. Also :393 |
| GET /users/get-by-field | `components/sessions/session-detail-view.tsx:415` | gw/user/user.controller.ts:89 → usr/user/user.rpc.controller.ts:31 (user.getUserByField) | OK |  |
| GET /classes/:id/students | `components/sessions/session-detail-view.tsx:428` | gw/class/class.controller.ts:116 → tsvc/class/class.rpc.controller.ts:51 (class.getStudents) | OK | Only when needRoster |
| GET /attendances/session/:id | `components/sessions/session-detail-view.tsx:450` | gw/attendance/attendance.controller.ts:29 → tsvc/attendance/attendance.rpc.controller.ts:15 (attendance.getBySession) | OK | STUDENT and PARENT views |
| GET /exercises | `components/sessions/student-session-detail.tsx:110` | gw/exercise/exercise.controller.ts:48 → tsvc/exercise/exercise.rpc.controller.ts:25 (exercise.getAll) | OK | sessionId, studentId, limit:1 |
| POST /upload | `components/sessions/student-session-detail.tsx:131` | gw/upload/upload.controller.ts:42 → third/uploads/upload.rpc.controller.ts:26 (upload.upload) | OK |  |
| PATCH /exercises/:id/submit | `components/sessions/student-session-detail.tsx:163` | gw/exercise/exercise.controller.ts:78 → tsvc/exercise/exercise.rpc.controller.ts:35 (exercise.submit) | OK | Body not diffed |
| POST /exercises | `components/sessions/student-session-detail.tsx:167` | gw/exercise/exercise.controller.ts:36 → tsvc/exercise/exercise.rpc.controller.ts:20 (exercise.create) | OK | Body not diffed |
| GET /upload/download | `components/sessions/session-shared.tsx:117` | gw/upload/upload.controller.ts:94 → third/uploads/upload.rpc.controller.ts:36 (upload.download) | OK |  |

## /sessions/[id]

Page file: `app/(app)/sessions/[id]/page.tsx`. Role-dependent (SessionDetailView vs StudentSessionDetail)

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| GET /curriculum/lessons | `components/sessions/session-detail-view.tsx:246` | gw/lesson/lesson.controller.ts:49 → tsvc/lesson/lesson.rpc.controller.ts:27 (lesson.getAll) | UNVERIFIED | Same route-order caveat as /classes/[id] |
| GET /sessions/:id | `components/sessions/session-detail-view.tsx:378` | gw/session/session.controller.ts:95 → tsvc/session/session.rpc.controller.ts:40 (session.getById) | OK | Also student-session-detail.tsx:103 |
| PATCH /sessions/:id | `components/sessions/session-detail-view.tsx:281` | gw/session/session.controller.ts:104 → tsvc/session/session.rpc.controller.ts:45 (session.update) | MISMATCH | Gateway only defines PUT /sessions/:id (session.controller.ts:104); PATCH not defined. Also :393 |
| GET /users/get-by-field | `components/sessions/session-detail-view.tsx:415` | gw/user/user.controller.ts:89 → usr/user/user.rpc.controller.ts:31 (user.getUserByField) | OK |  |
| GET /classes/:id/students | `components/sessions/session-detail-view.tsx:428` | gw/class/class.controller.ts:116 → tsvc/class/class.rpc.controller.ts:51 (class.getStudents) | OK | Only when needRoster |
| GET /attendances/session/:id | `components/sessions/session-detail-view.tsx:450` | gw/attendance/attendance.controller.ts:29 → tsvc/attendance/attendance.rpc.controller.ts:15 (attendance.getBySession) | OK | STUDENT and PARENT views |
| GET /exercises | `components/sessions/student-session-detail.tsx:110` | gw/exercise/exercise.controller.ts:48 → tsvc/exercise/exercise.rpc.controller.ts:25 (exercise.getAll) | OK | sessionId, studentId, limit:1 |
| POST /upload | `components/sessions/student-session-detail.tsx:131` | gw/upload/upload.controller.ts:42 → third/uploads/upload.rpc.controller.ts:26 (upload.upload) | OK |  |
| PATCH /exercises/:id/submit | `components/sessions/student-session-detail.tsx:163` | gw/exercise/exercise.controller.ts:78 → tsvc/exercise/exercise.rpc.controller.ts:35 (exercise.submit) | OK | Body not diffed |
| POST /exercises | `components/sessions/student-session-detail.tsx:167` | gw/exercise/exercise.controller.ts:36 → tsvc/exercise/exercise.rpc.controller.ts:20 (exercise.create) | OK | Body not diffed |
| GET /upload/download | `components/sessions/session-shared.tsx:117` | gw/upload/upload.controller.ts:94 → third/uploads/upload.rpc.controller.ts:36 (upload.download) | OK |  |

## /settings

Page file: `app/(app)/settings/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| GET /users/detail-user | `app/(app)/settings/page.tsx:1870` | gw/user/user.controller.ts:75 → usr/user/user.rpc.controller.ts:26 (user.getDetailUser) | OK |  |
| POST /users/avatar | `app/(app)/settings/page.tsx:767` | — | MISSING | No gateway route; no usr user route for avatar |
| PUT /users | `app/(app)/settings/page.tsx:792` | gw/user/user.controller.ts:126 → usr/user/user.rpc.controller.ts:41 (user.updateUser) | OK | avatar: null |
| PUT /users | `app/(app)/settings/page.tsx:812` | gw/user/user.controller.ts:126 → usr/user/user.rpc.controller.ts:41 (user.updateUser) | OK | Profile payload; body not diffed |
| POST /users/change-password | `app/(app)/settings/page.tsx:1163` | gw/user/user.controller.ts:195 → usr/user/user.rpc.controller.ts:63 (user.changePassword) | OK | useUserActions().changePassword (lib/services/user.service.ts:143) |
| GET /curriculum/grades | `app/(app)/settings/page.tsx:1545` | gw/curriculum/curriculum.controller.ts:84 (matches GET /curriculum/:id with id='grades') | MISMATCH | No gateway route for /curriculum/grades; 2-segment path resolves to GET /curriculum/:id with id 'grades' (curriculum.getById) |
| GET /users/grades | `app/(app)/settings/page.tsx:1547` | — | MISSING | No gateway route (lib/services/user.service.ts:121) |
| PUT /users/grade | `app/(app)/settings/page.tsx:1573` | gw/user/user.controller.ts:145 → usr/user/user.rpc.controller.ts:48 (user.updateUserByAdmin) | MISMATCH | No gateway route; matches PUT /users/:id with id='grade' (usr/user/user.service.ts:189-191 rejects non-UUID) |
| GET /students | `app/(app)/settings/page.tsx:696` | gw/student/student.controller.ts:114 → usr/user/user.rpc.controller.ts:21 (user.getUsers) | MISMATCH | Parent view; reads linkedStudentsPayload.students (settings page:702); Gateway returns {data,pagination} (usr/user/user.service.ts:60-80); UI reads `students` (types StudentsApiPayload). Gateway schema (gw/packages/entities/student/student.schema.ts:42-54) drops classCode/classId, no role filter |

## /students

Page file: `app/(app)/students/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| GET /classes | `app/(app)/students/page.tsx:130` | gw/class/class.controller.ts:75 → tsvc/class/class.rpc.controller.ts:36 (class.getAll) | OK |  |
| GET /students | `app/(app)/students/page.tsx:199` | gw/student/student.controller.ts:114 → usr/user/user.rpc.controller.ts:21 (user.getUsers) | MISMATCH | Reads apiPayload.students (students/page.tsx:208); classCode/classId filters dropped by gateway. Gateway returns {data,pagination} (usr/user/user.service.ts:60-80); UI reads `students` (types StudentsApiPayload). Gateway schema (gw/packages/entities/student/student.schema.ts:42-54) drops classCode/classId, no role filter |
| DELETE /students/:id | `app/(app)/students/page.tsx:224` | gw/student/student.controller.ts:260 → usr/user/user.rpc.controller.ts:58 (user.deleteUserByAdmin) | OK |  |
| GET /students/get-student-code | `components/students/add-student-dialog.tsx:87` | gw/student/student.controller.ts:35-43 → usr/user/user.rpc.controller.ts:31 (user.getUserByField with {}) | MISMATCH | Gateway sends empty payload to getUserByField, which rejects field 'undefined' (usr/user/user.service.ts:98-108). Generator exists only as HTTP in usr/student/student.controller.ts:32 with no MessagePattern |
| GET /classes | `components/students/add-student-dialog.tsx:98` | gw/class/class.controller.ts:75 → tsvc/class/class.rpc.controller.ts:36 (class.getAll) | OK |  |
| POST /students | `components/students/add-student-dialog.tsx:114` | gw/student/student.controller.ts:46 → usr/user/user.rpc.controller.ts:36 (user.createUser) | MISMATCH | UI sends classCode; not in gw createStudentSchema (gw/packages/entities/student/student.schema.ts:3-21), silently dropped |
| GET /classes | `components/students/edit-student-dialog.tsx:158` | gw/class/class.controller.ts:75 → tsvc/class/class.rpc.controller.ts:36 (class.getAll) | OK |  |
| PUT /students/:id | `components/students/edit-student-dialog.tsx:175` | gw/student/student.controller.ts:216 → usr/user/user.rpc.controller.ts:41 (user.updateUser) | MISMATCH | UI always sends classId (edit-student-dialog.tsx:196); not in updateStudentSchema (student.schema.ts:23-40), dropped. Forwards with userId only; role undefined |

## /students/[id]

Page file: `app/(app)/students/[id]/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| GET /students/:id | `app/(app)/students/[id]/page.tsx:135` | gw/student/student.controller.ts:147 → usr/user/user.rpc.controller.ts:31 (user.getUserByField ({id})) | MISMATCH | Gateway sends {id}; getUserByField needs {field,value} (usr/user/user.service.ts:98-108) -> 400 'Unsupported field: undefined'. Would also return an array, not one student |
| GET /exercises | `app/(app)/students/[id]/page.tsx:145` | gw/exercise/exercise.controller.ts:48 → tsvc/exercise/exercise.rpc.controller.ts:25 (exercise.getAll) | OK | studentId, limit:100 |
| PUT /students/:id | `components/students/edit-student-dialog.tsx:175` | gw/student/student.controller.ts:216 → usr/user/user.rpc.controller.ts:41 (user.updateUser) | MISMATCH | Same as /students (classId dropped) |
| GET /classes | `components/students/edit-student-dialog.tsx:158` | gw/class/class.controller.ts:75 → tsvc/class/class.rpc.controller.ts:36 (class.getAll) | OK |  |

## /test-monitor

Page file: `app/(app)/(admin)/test-monitor/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| GET /test-scenarios | `components/test-monitor/test-monitor-page.tsx:107` | gw/test-scenario/test-scenario.controller.ts:203 → third/test-scenario/test-scenario.rpc.controller.ts:32 (testscenario.list) | OK | ADMIN on both sides. Mock mode (?mock=1 / NEXT_PUBLIC_TEST_MONITOR_MOCK) disables requests |
| GET /test-scenarios/stats | `lib/services/test-scenario.service.ts:97` | gw/test-scenario/test-scenario.controller.ts:235 → third/test-scenario/test-scenario.rpc.controller.ts:47 (testscenario.stats) | OK |  |
| GET /test-scenarios/routes | `lib/services/test-scenario.service.ts:107` | gw/test-scenario/test-scenario.controller.ts:65 (local listHttpRoutes, no downstream) | OK |  |
| GET /test-scenarios/meta | `lib/services/test-scenario.service.ts:117` | gw/test-scenario/test-scenario.controller.ts:222 (local env read, no downstream) | OK |  |
| GET /test-scenarios/:id/runs | `lib/services/test-scenario.service.ts:127` | gw/test-scenario/test-scenario.controller.ts:246 → third/test-scenario/test-scenario.rpc.controller.ts:52 (testscenario.runs) | OK |  |
| GET /test-scenarios/fixtures | `lib/services/test-scenario.service.ts:137` | gw/test-scenario/test-scenario.controller.ts:129 → third/test-scenario/test-scenario.rpc.controller.ts:83 (testscenario.fixtures.list) | OK | Also hooks/useTestFixtures.hook.ts:21 |
| GET /test-scenarios/auth-profiles | `lib/services/test-scenario.service.ts:147` | gw/test-scenario/test-scenario.controller.ts:117 → third/test-scenario/test-scenario.rpc.controller.ts:78 (testscenario.authprofiles) | OK |  |
| GET /logs/stats | `components/test-monitor/test-monitor-page.tsx:120` | gw/log/log.controller.ts:58 → third/log/log.rpc.controller.ts:32 (log.stats) | OK |  |
| GET /logs/trace/:id | `hooks/useTestMonitorTrace.hook.ts:37` | gw/log/log.controller.ts:46 → third/log/log.rpc.controller.ts:27 (log.trace) | OK |  |
| POST /test-scenarios/:id/run | `components/test-monitor/test-monitor-page.tsx:202` | gw/test-scenario/test-scenario.controller.ts:284 → third/test-scenario/test-scenario.rpc.controller.ts:57 (testscenario.run) | OK | Also :225 (mutateAsync) and lib/services/test-scenario.service.ts:183 |
| POST /test-scenarios/generate | `components/test-monitor/test-monitor-page.tsx:269` | gw/test-scenario/test-scenario.controller.ts:77 → third/test-scenario/test-scenario.rpc.controller.ts:68 (testscenario.generate) | OK | Proposals only |
| POST /test-scenarios/bulk | `components/test-monitor/test-monitor-page.tsx:296` | gw/test-scenario/test-scenario.controller.ts:103 → third/test-scenario/test-scenario.rpc.controller.ts:73 (testscenario.createMany) | OK |  |
| POST /test-scenarios | `components/test-monitor/test-monitor-page.tsx:338` | gw/test-scenario/test-scenario.controller.ts:192 → third/test-scenario/test-scenario.rpc.controller.ts:27 (testscenario.create) | OK |  |
| PATCH /test-scenarios/:id | `components/test-monitor/test-monitor-page.tsx:337` | gw/test-scenario/test-scenario.controller.ts:262 → third/test-scenario/test-scenario.rpc.controller.ts:37 (testscenario.update) | OK |  |
| DELETE /test-scenarios/:id | `components/test-monitor/test-monitor-page.tsx:351` | gw/test-scenario/test-scenario.controller.ts:275 → third/test-scenario/test-scenario.rpc.controller.ts:42 (testscenario.delete) | OK |  |
| POST /test-scenarios/fixtures | `lib/services/test-scenario.service.ts:159` | gw/test-scenario/test-scenario.controller.ts:137 → third/test-scenario/test-scenario.rpc.controller.ts:88 (testscenario.fixtures.create) | OK |  |
| PATCH /test-scenarios/fixtures/:id | `lib/services/test-scenario.service.ts:162` | gw/test-scenario/test-scenario.controller.ts:153 → third/test-scenario/test-scenario.rpc.controller.ts:93 (testscenario.fixtures.update) | OK |  |
| DELETE /test-scenarios/fixtures/:id | `lib/services/test-scenario.service.ts:166` | gw/test-scenario/test-scenario.controller.ts:166 → third/test-scenario/test-scenario.rpc.controller.ts:98 (testscenario.fixtures.delete) | OK |  |
| POST /test-scenarios/fixtures/:id/resolve | `lib/services/test-scenario.service.ts:171` | gw/test-scenario/test-scenario.controller.ts:175 → third/test-scenario/test-scenario.rpc.controller.ts:103 (testscenario.fixtures.resolve) | OK | Body not diffed |
| POST /test-scenarios/:id/run?async=true | `hooks/useTestMonitorTrace.hook.ts:41` | gw/test-scenario/test-scenario.controller.ts:284 → third/test-scenario/test-scenario.rpc.controller.ts:57 (testscenario.run) | OK | Realtime run |
| WS /logs (socket namespace, event log:new) | `hooks/useLogSocket.hook.ts:36` | Direct to THIRD_SERVICE (NEXT_PUBLIC_THIRD_SERVICE_URL, default :4000), not via gateway: third/log/log.gateway.ts:31-33 ns /logs | OK | Connects to THIRD_SERVICE directly; event name not traced |

## /tutors

Page file: `app/(app)/(admin)/tutors/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| GET /admin/tutors | `hooks/useAdminUsers.hook.ts:32` | gw/admin/admin.controller.ts:125 → usr/user/user.rpc.controller.ts:21 (user.getUsers) | MISMATCH | Gateway forwards query unchanged (no role=TUTOR) so returns all roles. Response is {data,pagination}; UI reads data.tutors (tutors-page.tsx:105; types/user.types.ts:111). Tutor list always empty |
| POST /admin/tutors | `components/tutors/add-tutor-dialog.tsx:86` | gw/admin/admin.controller.ts:116 → usr/user/user.rpc.controller.ts:36 (user.createUser) | OK | Hook at hooks/useAdminUsers.hook.ts:44. Role forcing in gw not verified downstream |

## /users

Page file: `app/(app)/(admin)/users/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| GET /users | `components/users/users-page.tsx:124` | gw/user/user.controller.ts:52 → usr/user/user.rpc.controller.ts:21 (user.getUsers) | OK | Gateway has no @Roles here; any authenticated user can call it (page checks ADMIN only client-side) |
| DELETE /users/:id | `components/users/users-page.tsx:141` | gw/user/user.controller.ts:180 → usr/user/user.rpc.controller.ts:58 (user.deleteUserByAdmin) | OK | No backend role check (usr/user/user.service.ts:242-); page-only ADMIN check |
| PUT /users/:id/status | `components/users/users-page.tsx:149` | gw/user/user.controller.ts:165 → usr/user/user.rpc.controller.ts:53 (user.updateStatusUser) | MISMATCH | UI sends {id,isActive}; gw handler takes only the URL id and ignores the body; downstream flips status. No backend role check |
| POST /users | `components/users/create-user-dialog.tsx:104` | gw/user/user.controller.ts:108 → usr/user/user.rpc.controller.ts:36 (user.createUser) | OK | Body not diffed; no backend role check |
| PUT /users/:id | `components/users/edit-user-dialog.tsx:115` | gw/user/user.controller.ts:145 → usr/user/user.rpc.controller.ts:48 (user.updateUserByAdmin) | OK | Body not diffed; no backend role check |

## /transactions

Page file: `app/(app)/transactions/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| (static) | `components/transactions/transactions-page.tsx:41` | — | MOCK | TRANSACTIONS constant. Unused useTransactionsList (transactions.data.ts:59) would call /transactions, /wallets: not wired, not a UI request |

## /login

Page file: `app/(auth)/login/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| POST /auth/login | `components/auth/login-form.tsx:113` | gw/auth/auth.controller.ts:83 → usr/auth/auth.rpc.controller.ts:32 (auth.login) | OK | Via lib/services/auth.service.ts:21 |
| POST /auth/login/user-code | `components/auth/login-form.tsx:117` | gw/auth/auth.controller.ts:129 → usr/auth/auth.rpc.controller.ts:37 (auth.loginByUserCode) | OK | Body {userCode,password,role} matches loginByUserCodeSchema |
| GET /auth/google  or  /auth/facebook | `lib/oauth.ts:6` | gw/auth/auth.controller.ts:262 → usr/auth/auth.rpc.controller.ts:57 (auth.googleLogin (callback)) | OK | Full navigation, not fetch; facebook at lib/oauth.ts:11 |

## /register

Page file: `app/(auth)/register/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| POST /auth/register | `components/auth/register-form.tsx:59` | gw/auth/auth.controller.ts:54 → usr/auth/auth.rpc.controller.ts:27 (auth.register) | OK | confirmPassword not in gw registerSchema, stripped; harmless |

## /forgot-password

Page file: `app/(auth)/forgot-password/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| POST /auth/forgot-password | `components/auth/forgot-pass.tsx:45` | gw/auth/auth.controller.ts:202 → usr/auth/auth.rpc.controller.ts:47 (auth.forgotPassword) | OK |  |

## /reset-password

Page file: `app/(auth)/reset-password/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| POST /auth/reset-password | `components/auth/reset-pass.tsx:48` | gw/auth/auth.controller.ts:224 → usr/auth/auth.rpc.controller.ts:52 (auth.resetPassword) | OK | Body {jti,password,confirmPassword} matches resetPasswordBodySchema |

## /oauth/callback

Page file: `app/(auth)/oauth/callback/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| (none) | `components/auth/oauth-callback.tsx:24` | gw/auth/auth.controller.ts:274-300 (redirect target) | OK | No request; tokens read from query string. Gateway google callback redirects with accessToken/refreshToken in query |

## /flow-request

Page file: `app/(flow)/flow-request/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| (static) | `components/flow-request/flow-request.data.ts:1` | — | MOCK | Static flow-request.data.ts and flow-request-seed-data.ts |

## /flow-requests

Page file: `app/flow-requests/page.tsx`

| UI request (method path) | UI file:line | Backend route (module file:line) | Status | Note |
|---|---|---|---|---|
| GET /flow-requests | `components/flow-requests/flow-request-diagram.tsx:187` | — | MISSING | No gateway route; UI falls back to seed data (flow-request-diagram.tsx:198-199) |
| PUT /flow-requests/:id | `components/flow-requests/flow-request-diagram.tsx:292` | — | MISSING |  |
| DELETE /flow-requests/:id | `components/flow-requests/flow-request-diagram.tsx:316` | — | MISSING |  |
| POST /flow-requests | `components/flow-requests/add-flow-request-dialog.tsx:69` | — | MISSING |  |
| PUT /flow-requests/:id | `components/flow-requests/edit-flow-request-dialog.tsx:88` | — | MISSING |  |

## Backend endpoints not used by UI

Gateway routes the UI never calls (verified against all UI rows above):

| Method | Path | Module | Note |
|---|---|---|---|
| GET | / | gateway (gateway/src/app.controller.ts:16) | infra/health |
| GET | /kafka/emit | gateway (gateway/src/app.controller.ts:28) | infra/health |
| GET | /kafka/send | gateway (gateway/src/app.controller.ts:44) | infra/health |
| GET | /kafka/error | gateway (gateway/src/app.controller.ts:126) | infra/health |
| GET | /kafka/tutor/error | gateway (gateway/src/app.controller.ts:142) | infra/health |
| GET | /health/postgres | gateway (gateway/src/app.controller.ts:158) | infra/health |
| GET | /health/redis | gateway (gateway/src/app.controller.ts:206) | infra/health |
| GET | /admin/tutors/:id | gateway (gateway/src/features/admin/admin.controller.ts:145) |  |
| PUT | /admin/tutors/:id | gateway (gateway/src/features/admin/admin.controller.ts:155) |  |
| DELETE | /admin/tutors/:id | gateway (gateway/src/features/admin/admin.controller.ts:168) |  |
| POST | /admin/students | gateway (gateway/src/features/admin/admin.controller.ts:178) |  |
| GET | /admin/students | gateway (gateway/src/features/admin/admin.controller.ts:190) |  |
| GET | /admin/students/:id | gateway (gateway/src/features/admin/admin.controller.ts:213) |  |
| PUT | /admin/students/:id | gateway (gateway/src/features/admin/admin.controller.ts:223) |  |
| DELETE | /admin/students/:id | gateway (gateway/src/features/admin/admin.controller.ts:239) |  |
| GET | /ai-chat/history | gateway (gateway/src/features/ai-chat/ai-chat.controller.ts:44) |  |
| DELETE | /ai-chat/history | gateway (gateway/src/features/ai-chat/ai-chat.controller.ts:57) |  |
| GET | /auth/google/callback | gateway (gateway/src/features/auth/auth.controller.ts:274) | provider OAuth redirect |
| GET | /auth/facebook/callback | gateway (gateway/src/features/auth/auth.controller.ts:318) | provider OAuth redirect |
| GET | /chapter | gateway (gateway/src/features/chapter/chapter.controller.ts:47) |  |
| GET | /chapter/:id | gateway (gateway/src/features/chapter/chapter.controller.ts:61) |  |
| PUT | /chapter/:id | gateway (gateway/src/features/chapter/chapter.controller.ts:70) |  |
| POST | /classes/:id/students | gateway (gateway/src/features/class/class.controller.ts:102) |  |
| GET | /emails | gateway (gateway/src/features/email/email.controller.ts:17) |  |
| GET | /exercises/:id | gateway (gateway/src/features/exercise/exercise.controller.ts:69) |  |
| PUT | /curriculum/lessons/:id | gateway (gateway/src/features/lesson/lesson.controller.ts:72) |  |
| POST | /notifications | gateway (gateway/src/features/notification/notification.controller.ts:33) |  |
| PATCH | /notifications/read-all | gateway (gateway/src/features/notification/notification.controller.ts:77) |  |
| DELETE | /notifications/:id | gateway (gateway/src/features/notification/notification.controller.ts:103) |  |
| GET | /redis | gateway (gateway/src/features/redis/redis.controller.ts:24) |  |
| POST | /schedules | gateway (gateway/src/features/schedule/schedule.controller.ts:37) |  |
| GET | /schedules | gateway (gateway/src/features/schedule/schedule.controller.ts:62) |  |
| GET | /schedules/class/:classId | gateway (gateway/src/features/schedule/schedule.controller.ts:81) |  |
| GET | /schedules/:id | gateway (gateway/src/features/schedule/schedule.controller.ts:90) |  |
| PATCH | /schedules/:id | gateway (gateway/src/features/schedule/schedule.controller.ts:99) |  |
| DELETE | /schedules/:id | gateway (gateway/src/features/schedule/schedule.controller.ts:113) |  |
| POST | /sessions/bulk | gateway (gateway/src/features/session/session.controller.ts:50) |  |
| GET | /sessions/class/:classId | gateway (gateway/src/features/session/session.controller.ts:86) |  |
| GET | /tuitions/summary | gateway (gateway/src/features/tuition/tuition.controller.ts:48) |  |
| GET | /tuitions/:id | gateway (gateway/src/features/tuition/tuition.controller.ts:76) |  |
| DELETE | /tuitions/:id | gateway (gateway/src/features/tuition/tuition.controller.ts:99) |  |
| POST | /upload/multiple | gateway (gateway/src/features/upload/upload.controller.ts:67) |  |
| DELETE | /upload/:key | gateway (gateway/src/features/upload/upload.controller.ts:108) |  |

Downstream HTTP routes with no gateway equivalent (reachable only on the module port). The UI calls the same `/chat/*` paths through the gateway, where they are MISSING:

| Method | Path | Module | Note |
|---|---|---|---|
| POST | /run | tutor-service (tutor-service/src/features/agents/agents.controller.ts:11) | not proxied by gateway |
| GET | /chat/conversations | tutor-service (tutor-service/src/features/chat/chat.controller.ts:33) | chat (port 8888 gateway lacks it) |
| GET | /chat/users | tutor-service (tutor-service/src/features/chat/chat.controller.ts:43) | chat (port 8888 gateway lacks it) |
| GET | /chat/unread | tutor-service (tutor-service/src/features/chat/chat.controller.ts:53) | chat (port 8888 gateway lacks it) |
| GET | /chat/conversations/:id | tutor-service (tutor-service/src/features/chat/chat.controller.ts:63) | chat (port 8888 gateway lacks it) |
| GET | /chat/conversations/:id/messages | tutor-service (tutor-service/src/features/chat/chat.controller.ts:73) | chat (port 8888 gateway lacks it) |
| POST | /chat/conversations/direct | tutor-service (tutor-service/src/features/chat/chat.controller.ts:89) | chat (port 8888 gateway lacks it) |
| POST | /chat/conversations/group | tutor-service (tutor-service/src/features/chat/chat.controller.ts:102) | chat (port 8888 gateway lacks it) |
| POST | /chat/conversations/class/:classId | tutor-service (tutor-service/src/features/chat/chat.controller.ts:115) | chat (port 8888 gateway lacks it) |
| POST | /chat/conversations/:id/participants | tutor-service (tutor-service/src/features/chat/chat.controller.ts:125) | chat (port 8888 gateway lacks it) |
| POST | /chat/conversations/:id/read | tutor-service (tutor-service/src/features/chat/chat.controller.ts:139) | chat (port 8888 gateway lacks it) |

## Unverified items and why

- **GET /curriculum/lessons** (class-detail-page.tsx:162, session-detail-view.tsx:246). Gateway defines `GET /curriculum/lessons` in `LessonController` (gw/lesson/lesson.controller.ts:49) but also `GET /curriculum/:id` in `CurriculumController` (gw/curriculum/curriculum.controller.ts:84). `CurriculumModule` is imported before `LessonModule` (gw/app.module.ts:45-47), so Nest probably registers `:id` first and the request is handled by `curriculum.getById("lessons")`. Not confirmed without running the server.
- **Request bodies not diffed** for PATCH /exercises/:id/submit, POST /exercises, PATCH /exercises/:id/grade (score/comment), POST and PUT /curriculum, POST /chapter/:id, POST and PUT /tuitions, POST and PUT /users, PUT /users (profile), PUT /sessions/:id inline edits, POST /test-scenarios/fixtures/:id/resolve. Those rows are OK by route only.
- **Response envelopes** beyond the lists checked were not traced (curriculum, classes, tuitions, notifications, logs, reports, grades). Only the `students`/`tutors`/`students`-keyed reads were compared; the rest may still differ.
- **Role-dependent render paths** not traced: which branch of `/sessions/[id]` (SessionDetailView vs StudentSessionDetail), whether `ClassDetailWatchPage` / `SessionDetailWatchPage` render on `/classes/[id]`, and the `/sessions` page component tree (ui-pages §6.7-8). Rows under `/sessions` duplicate the `/sessions/[id]` components on the assumption ui-pages is right.
- **Socket events** not traced: `log:new` on `/logs` (THIRD_SERVICE, log.gateway.ts:31-33) and chat events on `/chat` (tutor-service chat.gateway.ts:28-33). The chat socket is marked MISSING because the UI connects to the gateway URL (socket.provider.tsx:28, 39), which has no WebSocket gateway.
- **POST /admin/tutors role forcing**: the gateway handler forwards the body to `user.createUser` unchanged (gw/admin/admin.controller.ts:116-122). The downstream role default was not verified, so the created role is unconfirmed.
- **GET /curriculum/:id with id "grades"** and **PUT /users/:id with id "grade"** (see settings rows): downstream rejection was inferred from the handler code (usr/user/user.service.ts:189-191 checks UUID) but not run.
- **Dead UI code not counted**: components/classes/page/curriculum-page.tsx, components/classes/components/curriculum-chapter-row.tsx, curriculum-lesson-row.tsx (singular `/lesson` paths, ui-pages §6.2) are not imported by any route. components/transactions/transactions.data.ts:59 and hooks/useQuery.hook.ts (/transactions, /items) are unused.
- **Downstream validation not run**: getUserByField rejection (usr/user/user.service.ts:98-108) was read, not executed. Mismatch claims for GET /students/:id and GET /students/get-student-code rest on that reading.
- **Nothing was executed**: no server was started and no HTTP request was made. All statuses are static.

## Corrections to ui-pages.md

- components/classes/page/class-detail-watch-page.tsx:619 `/classes/:id/curriculum` is a `<Link href>` (navigation), not an API call, so it is not listed.
- components/classes/page/session-submissions-page.tsx:158, 174, 181, 188, 313 and components/sessions/session-detail-view.tsx:512, 524 are `href` links, not requests.
- The `GET /classes/:id/watches` path is defined (gw/class/class.controller.ts:134), contrary to ui-pages §4 note "not defined by any service". It is OK.
- The `POST /sessions` from schedule-form-dialog.tsx:161 is broken, which ui-pages §6.5 flags as "intent unclear": the gateway requires startAt/endAt and the form does not send them, so it returns 400.
- The `PUT /users/:id/status` body `{isActive}` is ignored by the gateway (gw/user/user.controller.ts:165-177), which ui-pages did not catch.
- GET /students list response: the UI reads `students` and `pagination` (students/page.tsx:208), but the backend returns `{data, pagination}`. The filter params `classCode`/`classId` are dropped by the gateway schema. The students page cannot show students as-is.

