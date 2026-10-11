# tutor-service: HTTP, RabbitMQ, WebSocket and AI surface review

- Scanned: 2026-10-10
- Module root: `/home/haidangphan/Documents/tutor/tutor-service`
- Source scanned: `/home/haidangphan/Documents/tutor/tutor-service/src`
- Method: static reading only. Nothing was run, no tests executed, no DB or broker contacted.
- Transport facts: HTTP (Express, port `8888` default), RabbitMQ microservice queue `tutor_queue`, Socket.IO namespace `/chat`. There is **no Kafka** in this module. The `kafka.tutor` pattern name is a misnomer and is served over RabbitMQ. No SSE endpoints exist.

## Cross-cutting behaviour (applies to every HTTP route unless noted)

- **Global guard `JwtAuthGuard`** (`app.module.ts`, `APP_GUARD`). Skipped only when the handler/class has `@Public()`. Reads `Authorization: Bearer <jwt>`. Verifies with `JWT_ACCESS_SECRET`, else `JWT_SECRET`, else the hard-coded fallback `dev-insecure-jwt-secret`. Requires `typ==='access'`, string `sub` and `email`, and a `role` claim (non-listed strings become `STUDENT`; non-string throws). Then runs a DB lookup `users.id = sub`; missing user gives 401. Source: `packages/guards/jwt-auth.guard.ts:61`.
- **`LanguageGuard`** (`APP_GUARD`) always passes. Sets `request.language` from `Accept-Language` (`vi` default, `en` supported).
- **No global route prefix** (`main.ts`). Controllers set their own paths. Swagger UI at `/api-docs`.
- **No throttling.** `@Throttle()` is defined in `packages/decorators/throttle.decorator.ts` but no throttler guard is registered anywhere.
- **Role checks:** only `reports/learning/*` uses `RolesGuard` with `@Roles('ADMIN')`, reading the JWT `role` claim. Every other route enforces ownership or membership inside services.
- **Success envelope** (`ResponseInterceptor`): `{ statusCode, message, data, timestamp, method, path }`. `statusCode` is the actual HTTP status. Default HTTP status for `@Post` is 201 unless `@HttpCode` says otherwise.
- **Error envelope** (`HttpExceptionFilter`): `{ success:false, statusCode, message, errors?, path, timestamp }`. `message` is an error code such as `CLASS_NOT_FOUND`, translated to `vi` or `en`. A `trace` (stack) field is added for 5xx when `NODE_ENV !== 'production'`.
- **Validation failures** (`ZodValidationPipe`): HTTP 422 with `errors: [{field, message, code}]`, first issue per field. Only routes that attach the pipe are validated (see "Unvalidated bodies" below).
- **Non-HTTP errors** (`ErrorInterceptor`): always 500. Postgres codes 23503/23505/23502/23514 are converted to fixed text but still return 500, not 4xx. Messages starting with `Failed query:` become `Database error`.
- **UUID checks** in services use `checkUuidValid` (`packages/helpers/generate.helper.ts:13`). Regex accepts UUID versions 1-5 with RFC variant only. Missing or invalid IDs return 400 with a `*_MUST_BE_UUID` code.
- **Ownership responses:** where the caller is not the owner or has no access, most services return 404 (`*_NOT_FOUND`) rather than 403, to hide existence.

### Unvalidated bodies (no `ZodValidationPipe`)

- `POST /curriculum`, `PUT /curriculum/:id` (`CreateCurriculumDto` typed only)
- `POST /chat/conversations/direct`, `POST /chat/conversations/group`, `POST /chat/conversations/class/:classId` (no body), `POST /chat/conversations/:id/participants`
- Consequence: bad input reaches Postgres and comes back as 500 instead of 422.

## Summary table (HTTP)

| # | Method | Path | Auth | Success | Notable errors |
|---|---|---|---|---|---|
| 1 | GET | `/` | JWT | 200 `"Hello World!"` | 401 |
| 2 | POST | `/run` | **Public** | 201 `SDKMessage[]` | 500 (SDK/API failure); no auth, hard-coded prompt |
| 3 | POST | `/chapter/:curriculumId` | JWT | 201 chapter row | 400 CURRICULUM_ID_MUST_BE_UUID; 422; 500 on unknown curriculum (FK) |
| 4 | GET | `/chapter` | JWT | 200 `{chapters, pagination}` | 422 (curriculumId); 400 |
| 5 | GET | `/chapter/:id` | JWT | 200 chapter or null | 400 CHAPTER_ID_INVALID |
| 6 | PUT | `/chapter/:id` | JWT | 200 updated row | 404 CHAPTER_NOT_FOUND; 400; 422 |
| 7 | DELETE | `/chapter/:id` | JWT | 200 repo result | 404 CHAPTER_NOT_FOUND; 400 |
| 8 | GET | `/chat/conversations` | JWT | 200 conversation list | 401 |
| 9 | GET | `/chat/users` | JWT | 200 chatable users | 404 "User not found" |
| 10 | GET | `/chat/unread` | JWT | 200 `{convId: count}` | 401 |
| 11 | GET | `/chat/conversations/:id` | JWT | 200 conversation detail | 403 not participant; 404 |
| 12 | GET | `/chat/conversations/:id/messages` | JWT | 200 message array | 403; limit unbounded and unvalidated |
| 13 | POST | `/chat/conversations/direct` | JWT | 201 conversation detail | 403 role matrix; 403 self; 404 target |
| 14 | POST | `/chat/conversations/group` | JWT | 201 conversation detail | no participant validation; 500 on bad ids |
| 15 | POST | `/chat/conversations/class/:classId` | JWT | 201 conversation detail | 404 class; 403 (after creating row) |
| 16 | POST | `/chat/conversations/:id/participants` | JWT | 201 `{message}` | 403 not participant; no role check on added user |
| 17 | POST | `/chat/conversations/:id/read` | JWT | 201 `{message}` | no membership check; marks others' messages READ |
| 18 | GET | `/curriculum/generate-code` | JWT | **201** string code | 409 UNABLE_TO_GENERATE_UNIQUE_CODE |
| 19 | POST | `/curriculum` | JWT | 201 curriculum row | **no validation**; 400 USER_NOT_FOUND; 500 on bad fields |
| 20 | GET | `/curriculum` | JWT | 200 `{curriculums, pagination}` | 400 USER_NOT_FOUND; 422 |
| 21 | GET | `/curriculum/:id` | JWT | 200 curriculum+chapters or null | 400 CURRICULUM_ID_INVALID; shadows `/curriculum/lessons` (see Unclear) |
| 22 | PUT | `/curriculum/:id` | JWT | 200 updated row | **no validation**; 404 CURRICULUM_NOT_FOUND; no ownership check |
| 23 | DELETE | `/curriculum/:id` | JWT | 200 repo result | 404 CURRICULUM_NOT_FOUND; no ownership check |
| 24 | POST | `/curriculum/lessons` | JWT | 201 lesson row | 400 CURRICULUM_ID_MUST_BE_UUID; 422; 500 unknown curriculum |
| 25 | GET | `/curriculum/lessons` | JWT | 200 `{lessons, pagination}` | 400; likely unreachable (shadowed by #21) |
| 26 | GET | `/curriculum/lessons/:id` | JWT | 200 lesson or null | 400 LESSON_ID_INVALID |
| 27 | PUT | `/curriculum/lessons/:id` | JWT | 200 updated row | 404 LESSON_NOT_FOUND; 422 |
| 28 | DELETE | `/curriculum/lessons/:id` | JWT | 200 repo result | 404 LESSON_NOT_FOUND |
| 29 | POST | `/classes` | JWT | 201 class row | 400 CLASS_NAME_EXISTS / CLASS_CODE_EXISTS / TUTOR_NOT_FOUND; **no role check** |
| 30 | PUT | `/classes/:id` | JWT | 200 class row | 404 CLASS_NOT_FOUND; **`studentIds` deletes roster rows not in list** |
| 31 | GET | `/classes/generate-code` | JWT | 200 `{code}` | 409 |
| 32 | GET | `/classes` | JWT | 200 `{classes, pagination}` | 400; scope by role |
| 33 | GET | `/classes/:id` | JWT | 200 class + students | 404 (also for no access) |
| 34 | POST | `/classes/:id/students` | JWT | 200 `{classId, added, skipped, studentIds}` | 404 not owner; 400 STUDENT_NOT_FOUND / USER_NOT_A_STUDENT |
| 35 | GET | `/classes/:id/students` | JWT | 200 roster array | 404 |
| 36 | GET | `/classes/:id/materials` | JWT | 200 lessons + counts | 404; `exerciseUrls` not gated |
| 37 | GET | `/classes/:id/watches` | JWT | 200 overview | 404 |
| 38 | DELETE | `/classes/:id` | JWT | 200 `{id}` | 404 CLASS_NOT_FOUND (not owner) |
| 39 | POST | `/schedules` | JWT | 201 schedule row | 404 CLASS_NOT_FOUND (not owner); 422 |
| 40 | POST | `/schedules/bulk` | JWT | 201 rows | 404; 422 (1-7 items) |
| 41 | GET | `/schedules` | JWT | 200 `{schedules, pagination}` | 400; owned or enrolled scope |
| 42 | GET | `/schedules/class/:classId` | JWT | 200 array | 404 (owner only) |
| 43 | GET | `/schedules/:id` | JWT | 200 schedule row | 404 SCHEDULE_NOT_FOUND / CLASS_NOT_FOUND |
| 44 | PATCH | `/schedules/:id` | JWT | 200 updated row | 404; 422 |
| 45 | DELETE | `/schedules/:id` | JWT | 200 `{id}` | 404 |
| 46 | POST | `/sessions` | JWT | 201 session row | 404 CLASS / LESSON / TUTOR_NOT_FOUND; 422 |
| 47 | POST | `/sessions/bulk` | JWT | 201 rows | 404; 422 (1-50 items) |
| 48 | GET | `/sessions` | JWT | 200 `{sessions, pagination}` | exercises hidden until COMPLETED |
| 49 | GET | `/sessions/class/:classId` | JWT | 200 array | 404 (owner only) |
| 50 | GET | `/sessions/:id` | JWT | 200 session detail | 404 SESSION_NOT_FOUND (also no access) |
| 51 | PUT | `/sessions/:id` | JWT | 200 updated row | 404; **lessonId/tutorId not checked** (FK gives 500) |
| 52 | DELETE | `/sessions/:id` | JWT | 200 `{id}` | 404 |
| 53 | POST | `/exercises` | JWT | 201 exercise row | 403 EXERCISE_SUBMIT_NOT_ALLOWED; 409 EXERCISE_ALREADY_SUBMITTED; 404 |
| 54 | GET | `/exercises` | JWT | 200 `{data, pagination}` | 400; tutor-or-student scope |
| 55 | GET | `/exercises/:id` | JWT | 200 exercise detail | 404 EXERCISE_NOT_FOUND (also non-party) |
| 56 | PATCH | `/exercises/:id/submit` | JWT | 200 updated row | 403 EXERCISE_RE_SUBMIT_NOT_ALLOWED; 400 EXERCISE_ALREADY_GRADED |
| 57 | PATCH | `/exercises/:id/grade` | JWT | 200 updated row | 403 EXERCISE_GRADE_NOT_ALLOWED; 422 score 0-10; re-grade allowed |
| 58 | POST | `/tuitions` | JWT | 201 tuition row | 404 CLASS_NOT_FOUND (not tutor); studentId unchecked (500 FK) |
| 59 | GET | `/tuitions` | JWT | 200 `{tuitions, pagination}` | 400; student-or-tutor scope |
| 60 | GET | `/tuitions/summary` | JWT | 200 totals object | 400 CLASS_ID_INVALID; tutor-owned classes only |
| 61 | GET | `/tuitions/:id` | JWT | 200 tuition | 404 TUITION_RECORD_NOT_FOUND |
| 62 | PUT | `/tuitions/:id` | JWT | 200 updated row | 404 TUITION_RECORD_NOT_FOUND / CLASS_NOT_FOUND (not owner); 422 |
| 63 | DELETE | `/tuitions/:id` | JWT | 200 `{id}` | 404 (same as PUT) |
| 64 | GET | `/attendances/session/:sessionId` | JWT | 200 roster + marks | 404 SESSION_NOT_FOUND |
| 65 | PUT | `/attendances` | JWT | 200 attendance row | 403 ATTENDANCE_MARK_NOT_ALLOWED; 404 STUDENT_NOT_FOUND (not in roster); 422 |
| 66 | GET | `/reports/learning/summary` | JWT + ADMIN | 200 summary numbers | 403 (non-ADMIN) |
| 67 | GET | `/reports/learning/attendance-trend` | JWT + ADMIN | 200 six `{month, rate}` | 403 |
| 68 | GET | `/reports/learning/classes` | JWT + ADMIN | 200 `{data, pagination}` | 403; 422 |
| 69 | GET | `/dashboard/overview` | JWT | 200 `DashboardOverview` | 404 USER_NOT_FOUND; 400 |

---

## HTTP routes

### 1. GET /
- Source: `src/app.controller.ts:17` -> `AppService.getHello`
- Auth: JWT (global guard; no `@Public`)
- Request: none
- Success: 200, `data: "Hello World!"`
- Errors: 401 `Unauthorized ...` (no token, bad signature, wrong `typ`, or user row missing)
- Downstream: `users` (guard lookup only)

### 2. POST /run
- Source: `src/features/agents/agents.controller.ts:11` -> `AgentsService.run('1+1=?')`
- Auth: **`@Public()`**. No JWT check. `LanguageGuard` still runs.
- Request: body and query ignored. Prompt hard-coded to `1+1=?`.
- Success: 201 (POST default), `data: SDKMessage[]`. This is the full array of every SDK message from `query()`, not a stream.
- Errors: 500 on SDK or API failure (generic message from `ErrorInterceptor`).
- Downstream: `@anthropic-ai/claude-agent-sdk` `query()` with `model: claude-sonnet-5` (`agents.config.ts`). No DB, Redis or S3. No rate limit. Each call spends model tokens, and anyone can call it.

### 3. POST /chapter/:curriculumId
- Source: `src/features/chapter/chapter.controller.ts:30` -> `ChapterService.createChapterService` -> `ChapterRepository.create`
- Auth: JWT. Any role. No ownership check on the curriculum.
- Request: path `curriculumId` (UUID, else 400). Body `createChapterSchema`: `title` string 1-255 (required); `description` string optional; `order` int, coerced, default 0.
- Success: 201, `data`: chapter row
- Errors: 400 `CURRICULUM_ID_MUST_BE_UUID`; 422 (title missing, etc.); 500 when curriculum does not exist (FK `chapters.curriculum_id`, cascade on delete)
- Downstream: `chapters`

### 4. GET /chapter
- Source: `chapter.controller.ts:54` -> `getAllChaptersService` -> `findAll`
- Auth: JWT
- Request: query `curriculumId` (UUID, required), `page` int>=1 default 1, `limit` int 1-100 default 10
- Success: 200, `data: { chapters: [...], pagination: {total, page, limit, totalPages} }`
- Errors: 422 (curriculumId missing or not UUID); 400 `CURRICULUM_ID_MUST_BE_UUID`
- Downstream: `chapters`

### 5. GET /chapter/:id
- Source: `chapter.controller.ts:69` -> `getChapterByIdService` -> `findById`
- Auth: JWT
- Request: path `id` (UUID)
- Success: 200, `data`: chapter row, or `null` if missing (no 404)
- Errors: 400 `CHAPTER_ID_INVALID`
- Downstream: `chapters`

### 6. PUT /chapter/:id
- Source: `chapter.controller.ts:79` -> `updateChapterService`
- Auth: JWT
- Request: path `id`. Body `updateChapterSchema` = create schema `.partial()`: `title?`, `description?`, `order?`.
- Success: 200, `data`: result of `chapterRepository.update`
- Errors: 400 `CHAPTER_ID_INVALID`; 404 `CHAPTER_NOT_FOUND`; 422
- Downstream: `chapters`

### 7. DELETE /chapter/:id
- Source: `chapter.controller.ts:102` -> `deleteChapterService`
- Auth: JWT
- Request: path `id`
- Success: 200, `data`: result of `chapterRepository.delete`
- Errors: 400 `CHAPTER_ID_INVALID`; 404 `CHAPTER_NOT_FOUND`
- Downstream: `chapters` (lessons referencing the chapter: FK behaviour not verified)

### 8. GET /chat/conversations
- Source: `src/features/chat/chat.controller.ts:33` -> `ConversationService.getConversations`
- Auth: JWT. Any role. Scoped to the caller's participant rows.
- Request: none
- Success: 200, `data`: array of `{id, type, name, classId, createdBy, lastMessageAt, createdAt, participants: [{userId, firstName, lastName, avatar, role, joinedAt}], lastMessage: {id, senderId, content, status, createdAt} | null, unreadCount}`, ordered by `lastMessageAt` desc
- Errors: 401 (no `req.user`)
- Downstream: `conversations`, `conversation_participants`, `messages`, `users`

### 9. GET /chat/users
- Source: `chat.controller.ts:43` -> `ConversationService.getChatableUsers`
- Auth: JWT. Result depends on the caller's DB role.
- Request: none
- Success: 200, `data`: array of `{id, firstName, lastName, avatar, role}`. ADMIN: all active users except self. TUTOR: students and parents of its classes, plus admins. STUDENT: classmates, class tutors, admins. PARENT: tutors of children's classes.
- Errors: 404 (`NotFoundException('User not found')`, literal text) when the user row is missing
- Downstream: `users`, `classes`, `class_students`

### 10. GET /chat/unread
- Source: `chat.controller.ts:53` -> `MessageService.getUnreadCounts`
- Auth: JWT
- Request: none
- Success: 200, `data`: `{ [conversationId]: number }`. Counts messages from others newer than `lastReadAt`.
- Errors: 401
- Downstream: `conversation_participants`, `messages`

### 11. GET /chat/conversations/:id
- Source: `chat.controller.ts:63` -> `ConversationService.getConversationById`
- Auth: JWT. Caller must be a participant.
- Request: path `id` (not UUID-validated; a non-UUID becomes a DB error, likely 500)
- Success: 200, `data`: conversation row + `participants` + `lastMessage` (full message row)
- Errors: 403 `You are not a participant of this conversation`; 404 `Conversation not found`
- Downstream: `conversations`, `conversation_participants`, `users`, `messages`

### 12. GET /chat/conversations/:id/messages
- Source: `chat.controller.ts:73` -> `MessageService.getMessages`
- Auth: JWT. Caller must be a participant.
- Request: path `id`. Query `limit` (raw string, `parseInt`, default 50, **no bounds**; a non-numeric value gives NaN). Query `before` (message id; not validated; unknown id means no cursor filter).
- Success: 200, `data`: array of `{id, conversationId, senderId, content, status, createdAt}` in ascending order
- Errors: 403 not participant; 401. NaN or non-UUID inputs likely produce 500 (not run).
- Downstream: `conversation_participants`, `messages`

### 13. POST /chat/conversations/direct
- Source: `chat.controller.ts:89` -> `createDirectConversation`
- Auth: JWT. Role matrix enforced via `validateChatPermission`.
- Request: body `{ targetUserId: string }` (**not validated**)
- Success: 201, `data`: conversation detail (existing one returned if a DIRECT conversation between the two already exists)
- Errors: 403 `Cannot create conversation with yourself`; 404 `Target user not found` / `Current user not found`; 403 with one of: `Tutor can only chat with students/parents in their classes`, `Student can only chat with their tutors`, `Students can only chat with classmates`, `Parent can only chat with tutors of their children`, `You do not have permission to chat with this user`. ADMIN bypasses the matrix.
- Downstream: `users`, `classes`, `class_students`, `conversations`, `conversation_participants`

### 14. POST /chat/conversations/group
- Source: `chat.controller.ts:102` -> `createGroupConversation`
- Auth: JWT. Any role.
- Request: body `{ name: string, participantIds: string[] }` (**not validated**). Creator is always added. Duplicate ids and unknown ids are not filtered.
- Success: 201, `data`: conversation detail
- Errors: no explicit 4xx. Unknown or duplicate participant ids likely give 500 (FK or PK). Not run.
- Downstream: `conversations`, `conversation_participants`

### 15. POST /chat/conversations/class/:classId
- Source: `chat.controller.ts:115` -> `createClassConversation`
- Auth: JWT. **No check that the caller is the class tutor or a member.**
- Request: path `classId`
- Success: 201, `data`: conversation detail (existing CLASS conversation, or a newly created one with the tutor and enrolled students)
- Errors: 404 `Class not found`; 403 (from `getConversationById`) when the caller is not a participant. For a new conversation the rows are inserted **before** this 403, so a non-member request still creates the conversation with the tutor and students.
- Downstream: `classes`, `class_students`, `conversations`, `conversation_participants`

### 16. POST /chat/conversations/:id/participants
- Source: `chat.controller.ts:125` -> `ConversationService.addParticipant`
- Auth: JWT. Caller must be a participant.
- Request: path `id`. Body `{ userId: string }` (**not validated**).
- Success: 201, `data`: `{message: 'Participant added successfully'}` or `{message: 'User is already a participant'}`
- Errors: 403 `You are not a participant of this conversation`
- Note: the added user's role is not checked against `validateChatPermission`. Any participant can add any user, including to DIRECT conversations.
- Downstream: `conversation_participants`

### 17. POST /chat/conversations/:id/read
- Source: `chat.controller.ts:139` -> `MessageService.markConversationAsRead`
- Auth: JWT. **No membership check.**
- Request: path `id`
- Success: 201, `data`: `{message: 'Marked as read'}`
- Errors: none beyond 401
- Note: sets every message in the conversation not sent by the caller to `READ`, even when the caller is not a participant. The `lastReadAt` update is a no-op for non-members.
- Downstream: `messages`, `conversation_participants`

### 18. GET /curriculum/generate-code
- Source: `src/features/curriculum/curriculum.controller.ts:40` -> `CurriculumService.generateNewCodeService`
- Auth: JWT
- Request: none
- Success: **201** (`@HttpCode(CREATED)` on a GET), `data`: code string
- Errors: 409 `UNABLE_TO_GENERATE_UNIQUE_CODE` after 5 collisions
- Downstream: `curriculums` (`findByCode`)

### 19. POST /curriculum
- Source: `curriculum.controller.ts:51` -> `createCurriculumService` -> `CurriculumRepository.create`
- Auth: JWT. Any role.
- Request: body `CreateCurriculumDto`, **not validated**. Intended schema (`createCurriculumSchema`, unused on this path): `subject` 1-255; `code` 1-6 chars; `grade` string or number, coerced to number; `courseTime` string; `description?`; `gradesId` UUID.
- Success: 201, `data`: curriculum row
- Errors: 400 `USER_ID_MUST_BE_UUID` / `USER_NOT_FOUND`. Missing or bad fields produce 500 from the DB, not 422.
- Downstream: `users` (read), `curriculums` (insert)

### 20. GET /curriculum
- Source: `curriculum.controller.ts:81` -> `getAllCurriculumService` -> `findAll`
- Auth: JWT
- Request: query `page` int>=1 (default 1), `limit` 1-100 (default 10), `search` trimmed
- Success: 200, `data: { curriculums: [...with counts], pagination }`
- Errors: 400 `USER_ID_MUST_BE_UUID` / `USER_NOT_FOUND`; 422
- Downstream: `curriculums`, `chapters`, `lessons` (counts)

### 21. GET /curriculum/:id
- Source: `curriculum.controller.ts:107` -> `getCurriculumByIdService` -> `findByIdWithDetails`
- Auth: JWT
- Request: path `id`
- Success: 200, `data`: curriculum with chapters and lessons, or `null` if missing
- Errors: 400 `CURRICULUM_ID_INVALID` / `USER_ID_MUST_BE_UUID` / `USER_NOT_FOUND`
- Downstream: `curriculums`, `chapters`, `lessons`
- Note: `GET /curriculum/lessons` probably matches this route first (see Unclear).

### 22. PUT /curriculum/:id
- Source: `curriculum.controller.ts:123` -> `updateCurriculumService`
- Auth: JWT. **No ownership check.**
- Request: path `id`. Body `CreateCurriculumDto`, **not validated**.
- Success: 200, `data`: updated row
- Errors: 400 `CURRICULUM_ID_INVALID` / `USER_ID_MUST_BE_UUID` / `USER_NOT_FOUND`; 404 `CURRICULUM_NOT_FOUND`
- Downstream: `users`, `curriculums`

### 23. DELETE /curriculum/:id
- Source: `curriculum.controller.ts:155` -> `deleteCurriculumService`
- Auth: JWT. **No ownership check.**
- Request: path `id`
- Success: 200, `data`: repo delete result
- Errors: 400; 404 `CURRICULUM_NOT_FOUND`
- Downstream: `curriculums` (cascade to `chapters` per FK; lessons cascade not verified)

### 24. POST /curriculum/lessons
- Source: `src/features/lesson/lesson.controller.ts:30` -> `LessonService.createLessonService` -> `LessonRepository.create`
- Auth: JWT
- Request: query `curriculumId` (UUID, required), `chapterId` (optional UUID). Body `createLessonBodySchema`: `title` 1-255 (required); `description?`; `theoryUrls?` and `exerciseUrls?` arrays of `{name (min 1), url (URL), key (min 1)}`; `order` int default 0.
- Success: 201, `data`: lesson row
- Errors: 400 `CURRICULUM_ID_MUST_BE_UUID`, `CHAPTER_ID_MUST_BE_UUID`; 422; 500 on unknown curriculum or chapter (FK)
- Downstream: `lessons`

### 25. GET /curriculum/lessons
- Source: `lesson.controller.ts:86` -> `getAllLessonsService` -> `findAll`
- Auth: JWT
- Request: query `curriculumId` (UUID, required), `chapterId?` (UUID), `page`, `limit` (1-100)
- Success: 200, `data: { lessons, pagination }`
- Errors: 400 UUID codes; 422
- Downstream: `lessons`
- Note: probably unreachable because `GET /curriculum/:id` (#21) is registered first. Treat as unverified.

### 26. GET /curriculum/lessons/:id
- Source: `lesson.controller.ts:101` -> `getLessonByIdService`
- Auth: JWT
- Request: path `id`
- Success: 200, `data`: lesson row or `null`
- Errors: 400 `LESSON_ID_INVALID`
- Downstream: `lessons`

### 27. PUT /curriculum/lessons/:id
- Source: `lesson.controller.ts:111` -> `updateLessonService`
- Auth: JWT. **No ownership check.**
- Request: path `id`. Body `updateLessonSchema` = `createLessonSchema.partial()`. This includes `curriculumId?` and `chapterId?`, so the body can re-parent a lesson. FK validity is not checked.
- Success: 200, `data`: updated row
- Errors: 400 `LESSON_ID_INVALID`; 404 `LESSON_NOT_FOUND`; 422; 500 on bad FK
- Downstream: `lessons`

### 28. DELETE /curriculum/lessons/:id
- Source: `lesson.controller.ts:124` -> `deleteLessonService`
- Auth: JWT. **No ownership check.**
- Request: path `id`
- Success: 200, `data`: repo delete result
- Errors: 400 `LESSON_ID_INVALID`; 404 `LESSON_NOT_FOUND`
- Downstream: `lessons` (exercises reference lessons with `onDelete: set null`)

### 29. POST /classes
- Source: `src/features/class/class.controller.ts:35` -> `ClassService.createClassService` -> `ClassRepository.create`
- Auth: JWT. **No role check.** Any authenticated user can create a class for any `tutorId`.
- Request: body `createClassSchema`:
  - `name` string 1-255 (required)
  - `code` string 1-50 (required, must be unique)
  - `subject` string 1-255 (required)
  - `tuition` number >=0 coerced, default 0
  - `description?`
  - `status` enum `OPEN|CLOSED|UPCOMING`, default `OPEN`
  - `format` enum `ONLINE|OFFLINE`, default `OFFLINE`
  - `startTime` date (required); `endTime` date (required)
  - `location?`
  - `curriculumId` UUID or null, optional
  - `tutorId` UUID (required)
  - `schedulesId` UUID[] default `[]` (accepted; use not verified)
- Success: 201, `data`: class row
- Errors: 400 `USER_ID_MUST_BE_UUID`, `USER_NOT_FOUND` (caller row missing), `TUTOR_ID_MUST_BE_UUID`, `CLASS_NAME_EXISTS`, `CLASS_CODE_EXISTS`, `TUTOR_NOT_FOUND` (tutorId not a user; role not checked). A unique-index race returns the same 400 codes. 422 validation.
- Downstream: `users`, `classes`

### 30. PUT /classes/:id
- Source: `class.controller.ts:52` -> `updateClassService` -> `syncStudents` (`class.repository.ts:85`)
- Auth: JWT. Caller must be the class tutor.
- Request: path `id` (UUID). Body `updateClassSchema`: create schema `.partial()`, minus `tutorId`, plus `studentIds?` UUID[] max 100 (**no minimum; empty array allowed**).
- Success: 200, `data`: updated row (or existing row if nothing changed)
- Errors: 400 `USER_ID_MUST_BE_UUID`, `CLASS_ID_MUST_BE_UUID`, `CLASS_NAME_EXISTS`, `CLASS_CODE_EXISTS`, `STUDENT_NOT_FOUND: <id>`, `USER_NOT_A_STUDENT: <id>`; 404 `CLASS_NOT_FOUND` (missing or not owner); 422
- **Side effect:** when `studentIds` is present, `syncStudents` deletes every `class_students` row for the class whose `student_id` is not in the list. An empty array deletes all enrolments. This runs before the class update and is not transactional.
- Downstream: `classes`, `class_students`, `users`

### 31. GET /classes/generate-code
- Source: `class.controller.ts:70` -> `generateNewCodeService`
- Auth: JWT
- Request: none
- Success: 200, `data: { code }`
- Errors: 409 `UNABLE_TO_GENERATE_UNIQUE_CODE`
- Downstream: `classes` (code lookup)

### 32. GET /classes
- Source: `class.controller.ts:83` -> `getClassesService` -> `ClassRepository.getClasses`
- Auth: JWT
- Request: query `page` (default 1), `limit` 1-100 (default 10), `search` (trimmed; name, code, subject), `status` enum, `subject`, `studentsId` UUID (filters to classes that student is in)
- Scope by DB role: STUDENT gets enrolled classes; PARENT gets classes of their children; any other role (including ADMIN and TUTOR) gets classes where `tutorId = caller`.
- Success: 200, `data: { classes: [{...class, students[], schedules[]}], pagination }`
- Errors: 400 `USER_ID_MUST_BE_UUID`; 404 `USER_NOT_EXIST` (caller row missing); 422
- Downstream: `classes`, `class_students`, `users`, `schedules`

### 33. GET /classes/:id
- Source: `class.controller.ts:115` -> `getClassService`
- Auth: JWT. Access: class tutor, enrolled student, or parent of an enrolled student.
- Request: path `id`
- Success: 200, `data`: class row with `students`
- Errors: 400 `USER_ID_MUST_BE_UUID` / `CLASS_ID_MUST_BE_UUID`; 404 `CLASS_NOT_FOUND` (missing or no access)
- Downstream: `classes`, `class_students`, `users`

### 34. POST /classes/:id/students
- Source: `class.controller.ts:121` -> `addStudentsService` -> `addStudents`
- Auth: JWT. Caller must be the class tutor.
- Request: path `id`. Body `{ studentIds: UUID[] }`, min 1, max 100 (required).
- Success: 200, `data: { classId, added, skipped, studentIds: [added ids] }`
- Errors: 404 `CLASS_NOT_FOUND` (not owner); 400 `STUDENT_NOT_FOUND: <id>` or `USER_NOT_A_STUDENT: <id>`; 422
- Downstream: `classes`, `users`, `class_students` (insert on conflict do nothing)

### 35. GET /classes/:id/students
- Source: `class.controller.ts:143` -> `getAllStudentsService` -> `getAllStudent`
- Auth: JWT. Access: owner, enrolled, or parent of enrolled.
- Request: path `id`
- Success: 200, `data`: array of `{id, firstName, lastName, email, avatar, phone, role, userCode, parent: {id, firstName, ...}}`
- Errors: 404 `CLASS_NOT_FOUND`
- Downstream: `classes`, `class_students`, `users` (self-join for parent)

### 36. GET /classes/:id/materials
- Source: `class.controller.ts:162` -> `getClassMaterialsService` -> `getMaterials`
- Auth: JWT. Access: owner, enrolled, or parent of enrolled.
- Request: path `id`
- Success: 200, `data: { class: {id, name, subject, curriculumId}, lessons: [...lesson rows with theoryUrls/exerciseUrls], theoryCount, exerciseCount }`. With no curriculum, `lessons: []` and counts 0.
- Errors: 404 `CLASS_NOT_FOUND`; 400
- Note: `exerciseUrls` is **not** gated for students. Compare #48 and #50, which hide exercises until COMPLETED.
- Downstream: `classes`, `class_students`, `users`, `lessons`

### 37. GET /classes/:id/watches
- Source: `class.controller.ts:179` -> `getClassWatchService`
- Auth: JWT. Same access as #36.
- Request: path `id`
- Success: 200, `data: { class, recentSession, schedules, students }`. `recentSession` is the latest session with `exerciseUrls: []` for non-owners unless `COMPLETED`, or `null`.
- Errors: 404 `CLASS_NOT_FOUND`; 400
- Downstream: `classes`, `class_students`, `users`, `schedules`, `class_sessions`

### 38. DELETE /classes/:id
- Source: `class.controller.ts:193` -> `delClassService`
- Auth: JWT. Caller must be the class tutor.
- Request: path `id`
- Success: 200, `data: { id }`
- Errors: 400; 404 `USER_NOT_EXIST` (caller row missing); 404 `CLASS_NOT_FOUND` (missing or not owner)
- Downstream: `classes` (dependent rows depend on FK cascade; not verified)

### 39. POST /schedules
- Source: `src/features/schedule/schedule.controller.ts:34` -> `ScheduleService.createScheduleService` -> `ScheduleRepository.create`
- Auth: JWT. Caller must own the class (via `getOwnedClassService`).
- Request: body `createScheduleSchema`: `classId` UUID; `dayOfWeek` enum MONDAY..SUNDAY; `startTime`, `endTime` strings matching `HH:mm`; `format` `ONLINE|OFFLINE` default `ONLINE`; `location?`
- Success: 201, `data`: schedule row
- Errors: 400 `USER_ID_MUST_BE_UUID`; 404 `CLASS_NOT_FOUND` (not owner); 422 (bad enum or time format)
- Note: no check that `endTime > startTime`, and no overlap check in the code path read.
- Downstream: `classes`, `schedules`

### 40. POST /schedules/bulk
- Source: `schedule.controller.ts:48` -> `createSchedulesService` -> `createMany`
- Auth: JWT. Caller must own the class.
- Request: body `createSchedulesSchema`: `classId` UUID; `schedules` array of 1-7 items `{dayOfWeek, startTime, endTime, format? (default ONLINE), location?}`
- Success: 201, `data`: array of inserted rows
- Errors: 400 `USER_ID_MUST_BE_UUID`; 404 `CLASS_NOT_FOUND`; 422 (0 or more than 7 items)
- Downstream: `classes`, `schedules`

### 41. GET /schedules
- Source: `schedule.controller.ts:65` -> `getSchedulesService` -> `ScheduleRepository.getAll`
- Auth: JWT
- Request: query `page`, `limit` 1-100 (default 10), `search` (matches `schedules.location`), `classId` UUID
- Scope: classes the caller owns (tutor) plus classes the caller is enrolled in (student). PARENT is not in the scope (see Unclear).
- Success: 200, `data: { schedules: [{...schedule, class}], pagination }`
- Errors: 400 `USER_ID_MUST_BE_UUID`; 422
- Downstream: `schedules`, `classes`, `class_students`

### 42. GET /schedules/class/:classId
- Source: `schedule.controller.ts:85` -> `getSchedulesByClassService` -> `getByClass`
- Auth: JWT. Owner only.
- Request: path `classId`
- Success: 200, `data`: array of schedule rows
- Errors: 400 `CLASS_ID_MUST_BE_UUID`; 404 `CLASS_NOT_FOUND` (not owner)
- Downstream: `classes`, `schedules`

### 43. GET /schedules/:id
- Source: `schedule.controller.ts:95` -> `getScheduleService` -> `loadOwnedSchedule`
- Auth: JWT. Owner of the schedule's class.
- Request: path `id`
- Success: 200, `data`: schedule row (no class join)
- Errors: 400 `SCHEDULE_ID_MUST_BE_UUID` / `USER_ID_MUST_BE_UUID`; 404 `SCHEDULE_NOT_FOUND`; 404 `CLASS_NOT_FOUND` (exists but caller is not the tutor)
- Downstream: `schedules`, `classes`

### 44. PATCH /schedules/:id
- Source: `schedule.controller.ts:105` -> `updateScheduleService` -> `repo.update`
- Auth: JWT. Owner of the schedule's class.
- Request: path `id`. Body `updateScheduleSchema` = `createScheduleSchema.partial().omit({classId})`. All fields optional.
- Success: 200, `data`: result of `repo.update`
- Errors: as #43; 422
- Downstream: `schedules`, `classes`

### 45. DELETE /schedules/:id
- Source: `schedule.controller.ts:121` -> `delScheduleService` -> `repo.del`
- Auth: JWT. Owner of the schedule's class.
- Request: path `id`
- Success: 200, `data: { id }`
- Errors: as #43; 404 `SCHEDULE_NOT_FOUND` if the delete affects no row
- Downstream: `schedules`, `classes`

### 46. POST /sessions
- Source: `src/features/session/session.controller.ts:35` -> `SessionService.createSessionService` -> `SessionRepository.create`
- Auth: JWT. Caller must own the class.
- Request: body `createSessionSchema`:
  - `classId` UUID (required)
  - `lessonId?` UUID or null (checked: 404 `LESSON_NOT_FOUND`)
  - `tutorId?` UUID or null (defaults to caller; if different from caller, must be an existing user, else 404 `TUTOR_NOT_FOUND`)
  - `title?` max 255; `description?`
  - `sessionNumber` int >=1 (required)
  - `theoryUrls`, `exerciseUrls`: arrays of `{name (min 1), url (URL), key (min 1)}`, default `[]`
  - `startAt`, `endAt` dates (required)
  - `location?`; `status` enum `SCHEDULED|ONGOING|COMPLETED|CANCELLED|POSTPONED`, default `SCHEDULED`; `note?`
  - `actualStartAt?`, `actualEndAt?` dates or null
  - `objectives` string[] default `[]`; `agenda` `[{time, title, description?}]` default `[]`
  - `exerciseDueAt?` date or null
- Success: 201, `data`: session row
- Errors: 400 `USER_ID_MUST_BE_UUID`; 404 `CLASS_NOT_FOUND` (not owner), `LESSON_NOT_FOUND`, `TUTOR_NOT_FOUND`; 422
- Downstream: `classes`, `lessons`, `users`, `class_sessions`

### 47. POST /sessions/bulk
- Source: `session.controller.ts:52` -> `createSessionsService` -> `createMany`
- Auth: JWT. Caller must own the class.
- Request: body `createSessionsSchema`: `classId` UUID; `sessions` array of 1-50 items of `createSessionSchema` minus `classId`
- Success: 201, `data`: array of inserted rows
- Errors: as #46 (per distinct lesson and tutor, once); 422 for >50 or 0 items
- Downstream: `classes`, `lessons`, `users`, `class_sessions`

### 48. GET /sessions
- Source: `session.controller.ts:69` -> `getSessionsService` -> `SessionRepository.getAll`
- Auth: JWT
- Request: query `page`, `limit` 1-100 (default 10), `search` (matches `title`), `status` enum, `classId` UUID, `startDate`, `endDate` (coerced dates)
- Scope: owned classes (tutor) plus enrolled classes (student). PARENT is not in the scope.
- Success: 200, `data: { sessions: [{...session, class}], pagination }`. `exerciseUrls` set to `[]` for callers who are not the class tutor unless the session is `COMPLETED`.
- Errors: 400 `USER_ID_MUST_BE_UUID`; 422
- Downstream: `class_sessions`, `classes`, `class_students`

### 49. GET /sessions/class/:classId
- Source: `session.controller.ts:109` -> `getSessionsByClassService` -> `getByClass`
- Auth: JWT. Owner only.
- Request: path `classId`
- Success: 200, `data`: array of session rows (no gating needed for owner)
- Errors: 400 `CLASS_ID_MUST_BE_UUID`; 404 `CLASS_NOT_FOUND`
- Downstream: `classes`, `class_sessions`

### 50. GET /sessions/:id
- Source: `session.controller.ts:125` -> `getSessionService` -> `getDetailById`
- Auth: JWT. Access: class tutor, enrolled student, or parent of enrolled.
- Request: path `id`
- Success: 200, `data`: session detail with class. `exerciseUrls` gated for non-owners until `COMPLETED`.
- Errors: 400 `SESSION_ID_MUST_BE_UUID` / `USER_ID_MUST_BE_UUID`; 404 `SESSION_NOT_FOUND` (missing or no access)
- Downstream: `class_sessions`, `classes`, `class_students`, `users`, `lessons`, `chapters`

### 51. PUT /sessions/:id
- Source: `session.controller.ts:141` -> `updateSessionService` -> `repo.update`
- Auth: JWT. Owner of the session's class.
- Request: path `id`. Body `updateSessionSchema`: every field optional, **no defaults** (this avoids wiping arrays). Same field shapes as #46.
- Success: 200, `data`: result of `repo.update`
- Errors: 400 `SESSION_ID_MUST_BE_UUID`; 404 `SESSION_NOT_FOUND`; 404 `CLASS_NOT_FOUND` (not owner); 422
- Note: `lessonId` and `tutorId` are **not** existence-checked on update (only on create). A bad value gives a 23503 FK error, which is returned as **500**.
- Downstream: `class_sessions`

### 52. DELETE /sessions/:id
- Source: `session.controller.ts:163` -> `delSessionService` -> `repo.del`
- Auth: JWT. Owner of the session's class.
- Request: path `id`
- Success: 200, `data: { id }`
- Errors: 400; 404 `SESSION_NOT_FOUND` / `CLASS_NOT_FOUND`
- Downstream: `class_sessions` (dependent `attendances` and `exercises` cascade not verified)

### 53. POST /exercises
- Source: `src/features/exercise/exercise.controller.ts:35` -> `ExerciseService.createExerciseService` -> `ExerciseRepository.create`
- Auth: JWT. Caller must be the `studentId` or the `tutorId` in the body.
- Request: body `createExerciseSchema`:
  - `tutorId` UUID (required); `studentId` UUID (required)
  - `sessionId?` UUID or null; `lessonId?` UUID or null
  - `issueUrls?`, `exerciseUrls?`: arrays of `{name, url (plain string, not URL-validated), key}`, nullable
  - `status?` enum (accepted but ignored; always stored as `SUBMITTED`)
- Success: 201, `data`: exercise row
- Errors: 400 `ID_MUST_BE_UUID: User Id`; 403 `EXERCISE_SUBMIT_NOT_ALLOWED`; 404 `USER_NOT_FOUND: Tutor|Student`; 404 `SESSION_NOT_FOUND` (session not accessible to caller); 404 `LESSON_NOT_FOUND`; 409 `EXERCISE_ALREADY_SUBMITTED` (one per student per session); 422
- Downstream: `users`, `class_sessions`, `classes`, `class_students`, `lessons`, `exercises`

### 54. GET /exercises
- Source: `exercise.controller.ts:52` -> `getExercisesService` -> `ExerciseRepository.findAll`
- Auth: JWT. Scope: rows where caller is `tutorId` or `studentId`.
- Request: query `page`, `limit` 1-100 (default 10), `sessionId?`, `studentId?`, `classId?`, `tutorId?` (all UUID)
- Success: 200, `data: { data: [{...exercise, session, class, student}], pagination }`
- Errors: 400 `ID_MUST_BE_UUID: User Id`; 422
- Downstream: `exercises`, `class_sessions`, `classes`, `users`

### 55. GET /exercises/:id
- Source: `exercise.controller.ts:77` -> `getExerciseService`
- Auth: JWT. Caller must be the student or the tutor of the exercise.
- Request: path `id`
- Success: 200, `data`: exercise detail. `score` is returned as a number (mapped from the numeric column).
- Errors: 400 `ID_MUST_BE_UUID: ...`; 404 `EXERCISE_NOT_FOUND` (missing or non-party)
- Downstream: `exercises`

### 56. PATCH /exercises/:id/submit
- Source: `exercise.controller.ts:93` -> `submitExerciseService` -> `repo.update`
- Auth: JWT. Caller must be the `studentId`.
- Request: path `id`. Body `{ exerciseUrls: [{name, url, key}] }`, min 1 item (required).
- Success: 200, `data`: updated row with `status: SUBMITTED`
- Errors: 400 `ID_MUST_BE_UUID`; 404 `EXERCISE_NOT_FOUND`; 403 `EXERCISE_RE_SUBMIT_NOT_ALLOWED` (not the student); 400 `EXERCISE_ALREADY_GRADED`; 422 (empty list)
- Downstream: `exercises`

### 57. PATCH /exercises/:id/grade
- Source: `exercise.controller.ts:115` -> `gradeExerciseService` -> `repo.update`
- Auth: JWT. Caller must be the `tutorId`.
- Request: path `id`. Body `gradeExerciseSchema`: `score` number coerced, 0-10 (required); `comment?` string max 2000, nullable.
- Success: 200, `data`: result of `repo.update` (score stored as a Postgres numeric; whether this response maps it to a number is not verified)
- Errors: 400 `ID_MUST_BE_UUID`; 404 `EXERCISE_NOT_FOUND`; 403 `EXERCISE_GRADE_NOT_ALLOWED`; 422 (score out of range)
- Note: no guard against re-grading. `gradedAt` is reset on every call.
- Downstream: `exercises`

### 58. POST /tuitions
- Source: `src/features/tuition/tuition.controller.ts:30` -> `TuitionService.create` -> `getClassTutorId` / `TuitionRepository.create`
- Auth: JWT. Caller must be the tutor of the class.
- Request: body `createTuitionSchema`: `classId` UUID; `studentId` UUID; `amount` number >=0 coerced (required); `dueDate?`, `paidDate?` dates; `status` enum `PAID|UNPAID|OVERDUE` default `UNPAID`; `note?`
- Success: 201, `data`: tuition row (serialized with class and student fields)
- Errors: 400 `TUTOR_ID_INVALID` / `CLASS_ID_INVALID`; 404 `CLASS_NOT_FOUND` (missing class or caller is not the tutor); 422 (missing or negative amount). `studentId` is **not** checked against enrolment or existence, so a bad id is a 23503 FK, returned as 500.
- Downstream: `classes`, `tuitions`, `users` (FK)

### 59. GET /tuitions
- Source: `tuition.controller.ts:57` -> `TuitionService.findAll` -> `TuitionRepository.findAll`
- Auth: JWT. Scope: `studentId = caller` OR the caller is the tutor of the class.
- Request: query `page`, `limit` 1-100 (default 10), `classId?` UUID, `studentId?` UUID, `status?` enum
- Success: 200, `data: { tuitions: [serialized], pagination: {total, page, limit, totalPages} }`
- Errors: 400 `USER_ID_MUST_BE_UUID`; 422
- Downstream: `tuitions`, `classes`, `users`

### 60. GET /tuitions/summary
- Source: `tuition.controller.ts:74` -> `TuitionService.getSummary` -> `TuitionRepository.getSummary`
- Auth: JWT. Scope: tuitions of classes the caller tutors. A student caller gets zero totals (not an error).
- Request: query `classId?` (raw; UUID checked in service)
- Success: 200, `data: { totalPaid, totalUnpaid, totalOverdue, totalRevenue }` (`totalRevenue` equals `totalPaid`)
- Errors: 400 `CLASS_ID_INVALID`; 400 `USER_ID_MUST_BE_UUID`
- Downstream: `tuitions`, `classes`

### 61. GET /tuitions/:id
- Source: `tuition.controller.ts:89` -> `TuitionService.findById` -> `TuitionRepository.findById(id, userId)`
- Auth: JWT. Student of the record, or tutor of its class.
- Request: path `id`
- Success: 200, `data`: serialized tuition
- Errors: 400 `ID_MUST_BE_UUID`; 404 `TUITION_RECORD_NOT_FOUND` (missing or no access)
- Downstream: `tuitions`, `classes`, `users`

### 62. PUT /tuitions/:id
- Source: `tuition.controller.ts:98` -> `TuitionService.update` -> `repo.update`
- Auth: JWT. Caller must be the tutor of the record's class.
- Request: path `id`. Body `updateTuitionSchema` = `createTuitionSchema.partial().omit({classId, studentId})`: `amount?`, `dueDate?`, `paidDate?`, `status?`, `note?`.
- Success: 200, `data`: result of `repo.update`
- Errors: 400 `ID_MUST_BE_UUID`, `TUTOR_ID_INVALID`; 404 `TUITION_RECORD_NOT_FOUND` (missing); 404 `CLASS_NOT_FOUND` (not tutor); 422
- Downstream: `tuitions`, `classes`

### 63. DELETE /tuitions/:id
- Source: `tuition.controller.ts:124` -> `TuitionService.delete` -> `repo.delete`
- Auth: JWT. Tutor of the record's class.
- Request: path `id`
- Success: 200, `data: { id }`
- Errors: as #62
- Downstream: `tuitions`

### 64. GET /attendances/session/:sessionId
- Source: `src/features/attendance/attendance.controller.ts:25` -> `AttendanceService.getBySessionService`
- Auth: JWT. Access mirrors session detail: owner, enrolled, or parent of enrolled. Students see the whole roster and everyone's marks.
- Request: path `sessionId` (UUID)
- Success: 200, `data`: array of `AttendanceRecordDto` per roster student: `{studentId, firstName, lastName, avatar, userCode, present (default false), note, markedAt (ISO) | null}`
- Errors: 400 `ID_MUST_BE_UUID: User Id|Session Id`; 404 `SESSION_NOT_FOUND` (no access); 404 `CLASS_NOT_FOUND` (roster load)
- Downstream: `class_sessions`, `classes`, `class_students`, `users`, `attendances`

### 65. PUT /attendances
- Source: `attendance.controller.ts:41` -> `AttendanceService.upsertAttendanceService` -> `AttendanceRepository.upsert`
- Auth: JWT. Caller must be the class tutor of the session.
- Request: body `upsertAttendanceSchema`: `sessionId` UUID; `studentId` UUID; `present` boolean (required); `note?` string max 500, nullable
- Success: 200, `data`: upserted `attendances` row
- Errors: 400 `ID_MUST_BE_UUID`; 403 `ATTENDANCE_MARK_NOT_ALLOWED` (session exists but caller is not the tutor); 404 `SESSION_NOT_FOUND`; 404 `STUDENT_NOT_FOUND` (student not in class roster); 422
- Downstream: `attendances`, `class_sessions`, `class_students`

### 66. GET /reports/learning/summary
- Source: `src/features/report/report.controller.ts:27` -> `ReportService.getSummary`
- Auth: JWT + `RolesGuard` with `ADMIN` (reads the JWT `role` claim, not the DB)
- Request: none
- Success: 200, `data: { activeClasses, avgAttendanceRate (%), avgCurriculumProgress (%), submissionRate (%) }`
- Errors: 401 (no or invalid token); 403 `You do not have permission to access this resource`
- Downstream: `classes`, `class_sessions`, `attendances`, `exercises`, `lessons`, `class_students`

### 67. GET /reports/learning/attendance-trend
- Source: `report.controller.ts:39` -> `ReportService.getAttendanceTrend`
- Auth: JWT + ADMIN
- Request: none
- Success: 200, `data`: six items `{month: "MM/YYYY", rate: number}`, oldest first, current month last
- Errors: 401; 403
- Downstream: `class_sessions`, `attendances`

### 68. GET /reports/learning/classes
- Source: `report.controller.ts:50` -> `ReportService.getClassReports`
- Auth: JWT + ADMIN
- Request: query `page` (default 1), `limit` 1-100 (default 10), `search` (name, code, subject)
- Success: 200, `data: { data: [{classId, className, tutorName, studentCount, attendanceRate, curriculumProgress, assignmentsSubmitted, assignmentsTotal, averageScore | null}], pagination }`
- Errors: 401; 403; 422
- Downstream: `classes`, `users` (tutor join), `class_students`, `class_sessions`, `attendances`, `exercises`, `lessons`

### 69. GET /dashboard/overview
- Source: `src/features/dashboard/dashboard.controller.ts:19` -> `DashboardService.getOverview`
- Auth: JWT. Role comes from the DB `users.role` (default `STUDENT` when null). STUDENT: enrolled-class scope. Any other role: tutor-owned-class scope.
- Request: none
- Success: 200, `data: DashboardOverview`:
  - `role`
  - `stats`: `classesCount`, `studentsCount` (0 for students), `sessionsThisWeek`, `sessionsCompletedThisWeek`, `sessionsTodayCompleted`, `sessionsTodayPending`, `revenueThisMonth` (0 for students), `overdueTuitionCount`, `unpaidTuitionAmount`
  - `todaySchedule[]`, `upcomingSchedule[]` (next 5)
  - `monthly[12]`: `{month, revenue, sessions, newStudents, newClasses, cumulativeRevenue}`
- Errors: 400 `USER_ID_MUST_BE_UUID`; 404 `USER_NOT_FOUND`
- Note: the route description promises "recent notifications". The response has no such field, and the `notifications` table is not read here.
- Downstream: `users`, `classes`, `class_students`, `class_sessions`, `schedules`, `tuitions`

---

## RabbitMQ message patterns (RPC, `@MessagePattern`)

- Transport: RabbitMQ (`main.ts:38`). Queue `process.env.TUTOR_QUEUE ?? 'tutor_queue'`, durable, `prefetchCount: 10`, `deferInitialization: true`.
- Filters and interceptors: `RpcExceptionFilter` for all handlers. A thrown `HttpException` becomes `{statusCode, message, errors?, serviceName: 'tutor-service'}`. Any other error becomes `{statusCode: 500, message: <raw error.message>}`, which can leak driver or SQL text. `TraceContextInterceptor` opens the request context.
- **No auth on RPC.** No `JwtAuthGuard`, no `RolesGuard`, no Zod pipe. `userId` is taken from the payload as-is and trusted. Queue access must be restricted to the gateway.
- Response: the raw handler return value. No envelope.
- Errors for each pattern: same service errors as the HTTP route in the "HTTP #" column, with the status and code from that route.

### Core and AI patterns

| Pattern | Handler (file:line) | Payload | Returns | Maps to |
|---|---|---|---|---|
| `tutor.test` | `src/app.controller.ts:28` | any | `{message: 'Hello from tutor-service', receivedAt}` | none |
| `kafka.tutor` | `src/app.controller.ts:36` | any | throws `BadRequestException('data from tutor failed ...')`, so RPC status 400 | none |
| `ai.chat` | `src/features/agents/agents.rpc.controller.ts:16` | `{userId, data: {message}}` (not validated; `ChatDto` max 4000 not enforced here) | `{reply: {role:'assistant', content, createdAt}, history: AiChatMessage[]}` | Agent SDK `query()` plus in-memory history (see Unclear) |
| `ai.history` | `agents.rpc.controller.ts:21` | `{userId, query: {limit}}` (no coercion; undefined `query` throws, giving RPC 500) | `AiChatMessage[]` (last `limit`) | in-memory |
| `ai.clearHistory` | `agents.rpc.controller.ts:26` | `{userId}` | `{success: true}` | in-memory |

### Module patterns

| Pattern | Handler (file:line) | Payload | Same as HTTP # |
|---|---|---|---|
| `chapter.create` | `chapter.rpc.controller.ts:19` | `{curriculumId, data}` | 3 |
| `chapter.getAll` | `chapter.rpc.controller.ts:24` | `{query}` | 4 |
| `chapter.getById` | `chapter.rpc.controller.ts:29` | `{id}` | 5 |
| `chapter.update` | `chapter.rpc.controller.ts:34` | `{id, data}` | 6 |
| `chapter.delete` | `chapter.rpc.controller.ts:39` | `{id}` | 7 |
| `class.create` | `class.rpc.controller.ts:20` | `{data, userId}` | 29 |
| `class.update` | `class.rpc.controller.ts:25` | `{userId, id, data}` | 30 |
| `class.generateCode` | `class.rpc.controller.ts:30` | none | 31 (returns `{code}`) |
| `class.getAll` | `class.rpc.controller.ts:36` | `{userId, query}` | 32 |
| `class.getById` | `class.rpc.controller.ts:41` | `{userId, id}` | 33 |
| `class.addStudents` | `class.rpc.controller.ts:46` | `{userId, classId, data}` | 34 |
| `class.getStudents` | `class.rpc.controller.ts:51` | `{userId, id}` | 35 |
| `class.getMaterials` | `class.rpc.controller.ts:56` | `{userId, id}` | 36 |
| `class.getWatch` | `class.rpc.controller.ts:61` | `{userId, id}` | 37 |
| `class.delete` | `class.rpc.controller.ts:66` | `{userId, id}` | 38 |
| `curriculum.generateCode` | `curriculum.rpc.controller.ts:18` | none | 18 (returns `{code}`; HTTP returns a bare string) |
| `curriculum.create` | `curriculum.rpc.controller.ts:24` | `{userId, createCurriculum}` | 19 |
| `curriculum.getAll` | `curriculum.rpc.controller.ts:29` | `{userId, query}` | 20 |
| `curriculum.getById` | `curriculum.rpc.controller.ts:34` | `{userId, id}` | 21 |
| `curriculum.update` | `curriculum.rpc.controller.ts:39` | `{userId, id, data}` | 22 |
| `curriculum.delete` | `curriculum.rpc.controller.ts:44` | `{userId, id}` | 23 |
| `lesson.create` | `lesson.rpc.controller.ts:19` | `{curriculumId, chapterId?, data}` | 24 |
| `lesson.getAll` | `lesson.rpc.controller.ts:27` | `{query}` | 25 |
| `lesson.getById` | `lesson.rpc.controller.ts:32` | `{id}` | 26 |
| `lesson.update` | `lesson.rpc.controller.ts:37` | `{id, data}` | 27 |
| `lesson.delete` | `lesson.rpc.controller.ts:42` | `{id}` | 28 |
| `schedule.create` | `schedule.rpc.controller.ts:20` | `{userId, data}` | 39 |
| `schedule.createBulk` | `schedule.rpc.controller.ts:25` | `{userId, data}` | 40 |
| `schedule.getAll` | `schedule.rpc.controller.ts:30` | `{userId, query}` | 41 |
| `schedule.getByClass` | `schedule.rpc.controller.ts:35` | `{userId, classId}` | 42 |
| `schedule.getById` | `schedule.rpc.controller.ts:40` | `{userId, id}` | 43 |
| `schedule.update` | `schedule.rpc.controller.ts:45` | `{userId, id, data}` | 44 |
| `schedule.delete` | `schedule.rpc.controller.ts:50` | `{userId, id}` | 45 |
| `session.create` | `session.rpc.controller.ts:20` | `{userId, data}` | 46 |
| `session.createBulk` | `session.rpc.controller.ts:25` | `{userId, data}` | 47 |
| `session.getAll` | `session.rpc.controller.ts:30` | `{userId, query}` | 48 |
| `session.getByClass` | `session.rpc.controller.ts:35` | `{userId, classId}` | 49 |
| `session.getById` | `session.rpc.controller.ts:40` | `{userId, id}` | 50 |
| `session.update` | `session.rpc.controller.ts:45` | `{userId, id, data}` | 51 |
| `session.delete` | `session.rpc.controller.ts:50` | `{userId, id}` | 52 |
| `exercise.create` | `exercise.rpc.controller.ts:20` | `{userId, data}` | 53 |
| `exercise.getAll` | `exercise.rpc.controller.ts:25` | `{userId, query}` | 54 |
| `exercise.getById` | `exercise.rpc.controller.ts:30` | `{userId, id}` | 55 |
| `exercise.submit` | `exercise.rpc.controller.ts:35` | `{userId, id, data}` | 56 |
| `exercise.grade` | `exercise.rpc.controller.ts:40` | `{userId, id, data}` | 57 |
| `tuition.create` | `tuition.rpc.controller.ts:19` | `{data, userId}` | 58 |
| `tuition.getAll` | `tuition.rpc.controller.ts:24` | `{userId, query}` | 59 |
| `tuition.getSummary` | `tuition.rpc.controller.ts:29` | `{userId, classId?}` | 60 |
| `tuition.getById` | `tuition.rpc.controller.ts:34` | `{userId, id}` | 61 |
| `tuition.update` | `tuition.rpc.controller.ts:39` | `{id, data, userId}` | 62 |
| `tuition.delete` | `tuition.rpc.controller.ts:44` | `{id, userId}` | 63 |
| `attendance.getBySession` | `attendance.rpc.controller.ts:15` | `{userId, sessionId}` | 64 |
| `attendance.upsert` | `attendance.rpc.controller.ts:20` | `{userId, data}` | 65 |
| `report.summary` | `report.rpc.controller.ts:15` | none | 66 (**no ADMIN check on RPC**) |
| `report.attendanceTrend` | `report.rpc.controller.ts:20` | none | 67 (**no ADMIN check on RPC**) |
| `report.classList` | `report.rpc.controller.ts:25` | `{query}` | 68 (**no ADMIN check on RPC**) |
| `dashboard.overview` | `dashboard.rpc.controller.ts:14` | `{userId}` | 69 |

### Outbound RabbitMQ (this service as client)

- `log.create` (event, fire-and-forget): `main.ts:24` calls `setLogSink` -> `RmqProducer.emit('log.create', entry)`. Routed by first segment `log` to `THIRD_SERVICE` (queue `THIRD_QUEUE`, default `third_queue`). Payload: request-log entry. Errors are swallowed (`defaultValue: undefined`).
- Routing table also maps `auth.*` and `user.*` to USER_SERVICE and `redis.*`, `email.*`, `notification.*`, `upload.*` to THIRD_SERVICE (`features/rabbitmq/rmq.constants.ts:19`). **No call sites in this module** use these. `RmqProducer.send()` (request-reply with retries) is never called.
- No `@EventPattern` handlers exist.

---

## WebSocket (Socket.IO, namespace `/chat`)

- Gateway: `src/features/chat/chat.gateway.ts:28`. CORS `origin: true, credentials: true`.
- Connection auth: `handleConnection` (`:49`). Token from `handshake.auth.token`, or `Authorization: Bearer` header. Verified with the same secret chain as HTTP. Must have `typ==='access'` and a row in `users`. Otherwise the socket is disconnected silently (no error event).
- The `onlineUsers` map holds one socket per user. A second tab overwrites the first, and on disconnect the entry is deleted even if another tab is still open.
- Ack and reply shapes follow Nest's convention: a handler that returns `{event, data}` emits `event` with `data` back to the caller. Not runtime-verified.

### Client -> server events

| Event | Handler (`chat.gateway.ts`) | Payload | Reply / effect | Auth and checks |
|---|---|---|---|---|
| `message:send` | `:103` | `{conversationId, content}` (content not validated) | ack `message:sent` `{messageId, status:'delivered'}`, or `message:error` `{error:'Failed to send message'}`. Broadcasts `message:receive` `{id, conversationId, senderId, senderRole, content, timestamp, status}` to the room. | Participant check in `MessageService.createMessage`. Failures are swallowed into `message:error`. |
| `conversation:join` | `:136` | `{conversationId}` | `client.join(room)`; ack `conversation:joined` `{conversationId}` | **No membership check.** Any authenticated socket can join any conversation and then receives its `message:receive` and `typing:*` events. |
| `conversation:leave` | `:145` | `{conversationId}` | ack `conversation:left` | none |
| `typing:start` | `:154` | `{conversationId}` | to the room (excluding sender): `typing:start` `{userId, conversationId}` | **No membership check.** |
| `typing:stop` | `:166` | `{conversationId}` | to the room: `typing:stop` `{userId, conversationId}` | **No membership check.** |
| `user:get-online` | `:178` | none | ack `user:list-online` with an array of online user ids | none |
| `message:read` | `:184` | `{conversationId, messageId}` | `updateMessageStatus(messageId, 'READ')` plus `markConversationAsRead`; broadcasts `message:read` `{userId, conversationId, messageId}` to the room | **No membership check.** Errors are logged only. |

### Server -> client events

- `user:status` `{userId, status: 'online'|'offline'}`: sent with `server.emit` (to every socket in the namespace) on connect and disconnect (`:86`, `:98`).
- `message:receive`, `typing:start`, `typing:stop`, `message:read`: room broadcasts as above.
- `sendToUser` and `broadcastToConversation` helpers exist (`:206`, `:214`). Nothing in this module calls them.

### Streaming and AI event shapes

- **No SSE or chunked HTTP streaming.** `AgentsService.run()` (`agents.service.ts:21`) consumes the whole SDK `query()` iterator and returns the array. Callers get everything at the end.
- Raw event shape for `POST /run` (#2): each element is an `SDKMessage` from `@anthropic-ai/claude-agent-sdk`. The union (`sdk.d.ts:5273`) is discriminated by `type`: `assistant`, `user`, `result`, `system`, `stream_event` (partial, only with partial-message options, which are not set here), and others. Consumers must switch on `type`.
- `AiChatMessage` for `ai.*` RPC: `{role: 'user'|'assistant', content: string, createdAt: ISO}`. Capped at 100 entries per user (`MAX_HISTORY_PER_USER`).

---

## Unclear / not verified

- **Route shadowing:** `GET /curriculum/lessons` (#25) is probably matched first by `GET /curriculum/:id` (#21) because `CurriculumModule` is registered before `LessonModule` in `AppModule`. The result would be 400 `CURRICULUM_ID_INVALID`. Needs confirmation by running the app or dumping routes.
- **`/run` and agent behaviour:** the code does not set `tools`, `permissionMode`, `cwd`, `settingSources`, or an explicit API key. Whatever the SDK defaults are applies. Tool access, permission prompts, and the required env var (`ANTHROPIC_API_KEY`, assumed) are not verified. Model ids (`claude-sonnet-5`, `claude-opus-5`, `claude-fable-5-1`) are taken as written in `agents.config.ts`. Availability not checked. `CLAUDE_CONFIG` is defined but unused.
- **`ai.chat` / `AgentsService.chat()` likely always returns the fallback text.** It maps `message.text` where `'text' in message`. The `SDKMessage` union in the installed SDK types has no top-level `text` field (assistant content is under `message.content`). So `reply.content` would probably be `Không có phản hồi từ trợ lý.` on every call. Type-level evidence only; not run.
- **AI history is process memory only.** The `aiMessages` table exists in `schema.ts` but is not used. History is lost on restart and not shared across replicas.
- **Dashboard notifications:** the route description mentions notifications, but the response has no notification data. The `notifications` table is not read by this module.
- **Repository internals not fully read:** `update`/`delete` return shapes, `getDetailById` joins, `getClass` students join, `getMaterials`, and `findByIdWithDetails`. Responses for PUT/DELETE routes are described as "repo result" and are assumed to be the raw row.
- **Delete cascades:** confirmed in `schema.ts`: `chapters` and `lessons` cascade on curriculum delete; `lessons.chapter_id` and `exercises.lesson_id` set null; `class_students` and `tuitions` cascade on class delete. Cascades for `class_sessions`, `schedules`, `attendances`, `exercises` (session) and conversations were not confirmed.
- **Conversation participant uniqueness:** not confirmed in `schema.ts`. Duplicate-add and duplicate-participant behaviour depends on it.
- **Parent access to list endpoints:** `GET /schedules`, `GET /sessions` and `GET /tuitions` scope only owned or enrolled classes. A PARENT would probably get no rows here, but the repositories were not run to confirm.
- **Score type:** whether `PATCH /exercises/:id/grade` returns `score` as a string or number was not verified (the GET mapper converts it; the update path may not).
- **Schedule and session time validity:** no `endTime > startTime` check was seen. Overlap checks were not seen. Neither was verified against the repo layer.
- **UUID validation mismatch:** `checkUuidValid` only accepts UUID versions 1-5 with RFC variant. Zod's `.uuid()` is looser or stricter depending on version. IDs passing one check and failing the other would give mixed 400 and 422 responses. Not tested.
- **NaN and invalid query params:** `GET /chat/conversations/:id/messages` (`limit` NaN, non-UUID `before`) and `GET /chat/conversations/:id` (non-UUID id) probably return 500. Not run.
- **Duplicate and unknown ids in group chat:** likely 500 from PK or FK violations. Not run.
- **Secrets fallback:** if neither `JWT_ACCESS_SECRET` nor `JWT_SECRET` is set, the guard and the WebSocket gateway accept tokens signed with the literal `dev-insecure-jwt-secret`. Deployed env not checked (`docker.env` exists but was not read).
- **Pattern routing config:** `RMQ_PATTERN_ROUTES` is empty. Prefix routing only.
- **Existing docs not cross-checked:** `API_ENDPOINTS.md` and `PAGES_API_REVIEW.md` in the module root were not compared line by line. `API_ENDPOINTS.md` lists `/auth/*` routes, which do not exist in this module (auth belongs to the USER service).
- **Swagger:** `/api-docs` is wired in `main.ts:97`. Generated spec not inspected.
- **Runtime:** nothing executed. No tests run. Every claim above is from reading source, and items marked "likely" or "not verified" need a live check.
