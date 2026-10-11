# Gateway Route Table

Condensed from `gateway.md` (134 routes, route order). `*` = required; "(inferred)" = shape not traced. Error codes list only the statuses the doc gives per route; "401" = missing, invalid or expired Bearer token or session, unless noted.

## App and framework routes

| # | Method | Route | Request | Success response | Error codes |
|---|---|---|---|---|---|
| 1 | GET | / | none | 200 · string "Hello World!" | 401 no/invalid token; 401 session expired or not found |
| 2 | GET | /kafka/emit | none | 200 · no data (fire-and-forget) (inferred) | 500 RabbitMQ publish fails |
| 3 | GET | /kafka/send | none (fixed test payload sent to user-service) | 200 · {userId, email, fullName, username, role, processedAt, receivedAt, requestId, duration} | 504 no reply on 3 attempts (10 s each); 500 broker connection failure |
| 4 | GET | /kafka/error | none | none (always fails) | 400 downstream always throws "data from user failed ..." |
| 5 | GET | /kafka/tutor/error | none | none (always fails) | 400 "data from tutor failed ..." relayed via user-service |
| 6 | GET | /health/postgres | none | 200 · {connection, status, timestamp, databaseStats{stats, sampleUsers[]}} | 504 no reply in 30 s; DB failure still 200 with databaseStats.status "unhealthy" |
| 7 | GET | /health/redis | none | 200 · {connection, status, timestamp, cacheStats{ping, stats, sampleKeys}} | 504 no reply in 30 s; Redis down still 200 with cacheStats.status "unhealthy" |

## Auth (`/auth`)

| # | Method | Route | Request | Success response | Error codes |
|---|---|---|---|---|---|
| 8 | POST | /auth/register | body: {email*, password* (6-25, mixed case, digit, special), username, firstName*, lastName*} | 200 · {user{id, email, username, firstName, lastName}} (message "Login successful") | 422 validation; 400 email or username already exists; 504 no reply |
| 9 | POST | /auth/login | body: {email*, password* (same rules as register)} | 200 · {accessToken, refreshToken, user{id, email, userCode, username}} | 422 validation; 400 User not found; 400 Invalid password (Swagger says 401; code returns 400) |
| 10 | POST | /auth/login/user-code | body: {userCode* (6 chars), password*, role* (PARENT or STUDENT; TUTOR rejected)} | 200 · {accessToken, refreshToken, user{id, email, userCode, username}} | 422 validation (short code, bad role); 400 User not found for code and role; 400 Invalid password |
| 11 | POST | /auth/refresh | body: {refreshToken*} | 200 · {accessToken, refreshToken, user} (message "Token refreshed") | 422 empty token; 401 invalid or expired refresh token; 401 User no longer exists |
| 12 | POST | /auth/forgot-password | body: {email*} | 200 · {ok: true} | 422 invalid email; 400 User not found (reveals account existence); 500 email send fails (inferred message) |
| 13 | POST | /auth/reset-password | body: {jti* (uuid), password*, confirmPassword* (newPassword alias for password)} | 200 · {ok: true} | 401 no Bearer token (route is not @Public); 422 confirmPassword mismatch or jti not UUID; 400 Invalid reset password token (missing, expired or used) |
| 14 | GET | /auth/google | none (Passport redirect) | 302 redirect to Google consent (no body) | Passport failures (shape not verified) |
| 15 | GET | /auth/google/callback | Google OAuth query params (Passport) | 302 to GOOGLE_OAUTH_REDIRECT_URL with ?accessToken=&refreshToken= | 400 Failed to create user (FAILED_TO_CREATE_USER, JSON); 504 USER no reply (JSON); Passport failures (not verified) |
| 16 | GET | /auth/facebook | none (Passport redirect) | 302 redirect to Facebook consent (no body) | Passport failures (shape not verified) |
| 17 | GET | /auth/facebook/callback | Facebook OAuth query params (Passport) | 302 to GOOGLE_OAUTH_REDIRECT_URL with ?accessToken=&refreshToken= | 400 Failed to create user (JSON); 504 USER no reply (JSON); Passport failures (not verified) |

## Admin (`/admin`)

Class-level RolesGuard (ADMIN). Every route returns 403 for non-admin callers.

| # | Method | Route | Request | Success response | Error codes |
|---|---|---|---|---|---|
| 18 | POST | /admin/tutors | body (strict): {email*, password* (6-20; complexity only at 8-14 chars), firstName* (2-100), lastName* (2-100), username, phone, gender, dateOfBirth, school, subjects[], description, isActive}; unknown keys incl. role | 201 · {message, data{email, fullName, password (bcrypt hash)}} | 401; 403 not ADMIN; 422 validation or unknown key; 400 email or username exists; 504 no reply (3 x 10 s); 500 broker failure |
| 19 | GET | /admin/tutors | query: page (1), limit (1-100, 10), search, isActive (true/false) | 200 · {data[{id, email, name, role, status, createdAt}], pagination{page, pageSize, total, totalPages}} | 401; 403; 422 (e.g. isActive=yes); 504; 500 broker |
| 20 | GET | /admin/tutors/:id | path: id | 200 · user row array (inferred; unreachable today) | 401; 403; 400 always (sends {id}, downstream needs {field, value}: "Unsupported field: undefined"); 504; 500 broker |
| 21 | PUT | /admin/tutors/:id | path: id; body (strict, all optional): email, username, firstName, lastName, phone, gender, dateOfBirth, school, subjects[], description, avatar, isActive | 200 · full updated users row incl. password hash | 401; 403; 422 validation or unknown key (e.g. password); 400 User not found or id not UUID; 504; 500 broker |
| 22 | DELETE | /admin/tutors/:id | path: id | 200 · {id} | 401; 403; 400 User not found (unknown or already deleted) or id not UUID; 504; 500 broker |
| 23 | POST | /admin/students | body: same as #18 (gateway sends no role; downstream stores STUDENT) | 201 · {message, data{email, fullName, password (bcrypt hash)}} | 401; 403; 422 validation or unknown key; 400 email or username exists; 504; 500 broker |
| 24 | GET | /admin/students | query: same as #19 | 200 · {data[], pagination} (same shape as #19) | 401; 403; 422 (e.g. limit=0); 504; 500 broker |
| 25 | GET | /admin/students/:id | path: id | 200 · user row (inferred; unreachable today) | 401; 403; 400 always (id vs field/value mismatch); 504; 500 broker |
| 26 | PUT | /admin/students/:id | path: id; body (strict, all optional): tutor update fields plus userCode, address, district, province, parentId (uuid), tutorId (uuid) | 200 · full updated users row incl. password hash | 401; 403; 422 validation (e.g. non-UUID tutorId); 400 User not found or id not UUID; 500 FK violation for unknown tutorId or parentId (raw DB text) |
| 27 | DELETE | /admin/students/:id | path: id | 200 · {id} | 401; 403; 400 User not found or id not UUID; 504; 500 broker |

## AI chat (`/ai-chat`)

| # | Method | Route | Request | Success response | Error codes |
|---|---|---|---|---|---|
| 28 | POST | /ai-chat/chat | body: {message* (1-4000 chars)} | 200 · {reply{role, content, createdAt}, history[]} (content likely always fallback text, not run) | 401 (or session expired); 422 empty or over 4000 chars; 504 no SDK reply on 3 attempts; 500 broker |
| 29 | GET | /ai-chat/history | query: limit (1-200, 50) | 200 · array of {role, content, createdAt}, oldest first | 401; 422 limit=0; 504; 500 broker |
| 30 | DELETE | /ai-chat/history | none | 200 · {success: true} | 401; 504; 500 broker |

## Attendance (`/attendances`)

| # | Method | Route | Request | Success response | Error codes |
|---|---|---|---|---|---|
| 31 | GET | /attendances/session/:sessionId | path: sessionId (not validated at gateway) | 200 · array of {studentId, firstName, lastName, avatar, userCode, present, note, markedAt} (all roster students) | 401; 400 sessionId not UUID; 404 Session not found (not visible to caller); 504; 500 broker |
| 32 | PUT | /attendances | body: {sessionId* (uuid), studentId* (uuid), present* (boolean), note (max 500)} | 200 · {id, sessionId, studentId, present, note, createdAt, updatedAt} (upsert) | 401; 422 validation (e.g. present not boolean); 403 only the class tutor may mark; 404 Student not found (not in roster); 404 Session not found; 504; 500 broker |

## Chapter (`/chapter`)

| # | Method | Route | Request | Success response | Error codes |
|---|---|---|---|---|---|
| 33 | POST | /chapter/:curriculumId | path: curriculumId; body: {title* (1-255), description, order (0)} | 201 · chapter row {id, curriculumId, title, description, order, createdAt, updatedAt} | 401; 422 empty title; 400 curriculumId not UUID; 500 FK violation for unknown curriculum (not 404); 504 (duplicate on retry) |
| 34 | GET | /chapter | query: curriculumId* (uuid), page (1), limit (1-100, 10) | 200 · {chapters[], pagination{total, page, limit, totalPages}} | 401; 422 curriculumId missing or not UUID; 504; 500 broker |
| 35 | GET | /chapter/:id | path: id | 200 · chapter row, or null when not found (not 404) | 401; 400 id not UUID; 504; 500 broker |
| 36 | PUT | /chapter/:id | path: id; body (all optional): title, description, order | 200 · updated chapter row | 401; 422 empty title; 400 id not UUID; 404 Chapter not found; 504; 500 broker |
| 37 | DELETE | /chapter/:id | path: id | 200 · true | 401; 400 id not UUID; 404 Chapter not found (unknown or already deleted); 504; 500 broker |

## Classes (`/classes`)

| # | Method | Route | Request | Success response | Error codes |
|---|---|---|---|---|---|
| 38 | POST | /classes | body: {name*, code*, subject*, tuition (0), description, status (OPEN/CLOSED/UPCOMING, OPEN), format (ONLINE/OFFLINE, OFFLINE), startTime*, endTime*, location, curriculumId (uuid), tutorId* (uuid), schedulesId[] (uuid)} | 201 · class row (unreachable: payload mismatch) | 401; 422 validation (e.g. bad tutorId); 500 "Cannot destructure property 'name'" on every valid body; 504. Downstream 400/404 codes unreachable until fixed |
| 39 | PUT | /classes/:id | path: id; body (all optional): any create field except tutorId, plus studentIds[] (max 100) | 200 · class row (unreachable: payload mismatch) | 401; 422 validation (e.g. status ARCHIVED); 404 Class not found (non-owner); 500 "Cannot read properties of undefined" for owner; 504 |
| 40 | GET | /classes/generate-code | none | 200 · {code} (6 uppercase alphanumerics) | 401; 409 could not generate unique code; 504 |
| 41 | GET | /classes | query: page (1), limit (1-100, 10), search, status (OPEN/CLOSED/UPCOMING), subject, studentsId (uuid) | 200 · {classes[] (with students, schedules), pagination}; filters silently dropped downstream | 401; 422 (e.g. limit=500); 504 |
| 42 | GET | /classes/:id | path: id | 200 · class row with enrolled students | 401; 400 id not UUID; 404 Class not found (not tutor, enrolled student or parent); 504 |
| 43 | POST | /classes/:id/students | path: id; body: {studentIds* (uuid[], 1-100)} | 200 · {classId, added, skipped, studentIds[]} (unreachable: payload mismatch; 200 not 201) | 401; 422 empty studentIds; 404 Class not found (non-owner); 500 "reading 'studentIds'" for owner; 504 |
| 44 | GET | /classes/:id/students | path: id | 200 · array of students with parent (unreachable today) | 401; 400 always (gateway sends classId, handler reads id: CLASS_ID_MUST_BE_UUID); 504 |
| 45 | GET | /classes/:id/materials | path: id | 200 · {class, lessons[], theoryCount, exerciseCount} (unreachable today) | 401; 400 always (classId/id mismatch); 504 |
| 46 | GET | /classes/:id/watches | path: id | 200 · {class, recentSession, schedules[], students[]} (unreachable today) | 401; 400 always (classId/id mismatch); 504 |
| 47 | DELETE | /classes/:id | path: id | 200 · {id} | 401; 404 Class not found (not tutor, or does not exist); 504 |

## Curriculum (`/curriculum`)

| # | Method | Route | Request | Success response | Error codes |
|---|---|---|---|---|---|
| 48 | GET | /curriculum/generate-code | none | 201 · {code} (HttpCode CREATED on a GET) | 401; 409 could not generate unique code; 504 |
| 49 | POST | /curriculum | body: {subject* (1-255), code* (1-6), grade* (string or number), courseTime*, description, gradesId* (uuid)} | 201 · curriculum row (unreachable: payload mismatch; gradesId stored as null even when fixed) | 401; 422 code length; 500 "Cannot destructure property 'subject'" on every valid body; 504 |
| 50 | GET | /curriculum | query: page (1), limit (1-100, 10), search | 200 · {curriculums[], pagination} (unreachable today) | 401; 422 (e.g. limit=0); 500 "reading 'page'" on every valid call; 504 |
| 51 | GET | /curriculum/:id | path: id | 200 · curriculum with chapters and lessons; null when not found | 401; 400 id not UUID; 504 |
| 52 | PUT | /curriculum/:id | path: id; body (all optional): any create field | 200 · updated curriculum row | 401; 422 validation (e.g. empty code); 404 Curriculum not found; 504 |
| 53 | DELETE | /curriculum/:id | path: id | 200 · true | 401; 404 Curriculum not found; 504 |

## Lessons (`/curriculum/lessons`)

| # | Method | Route | Request | Success response | Error codes |
|---|---|---|---|---|---|
| 54 | POST | /curriculum/lessons | query: curriculumId, chapterId (raw, not validated at gateway); body: {title* (1-255), description, theoryUrls[] ({name, url, key}), exerciseUrls[] (same), order (0)} | 201 · lesson row | 401; 422 empty title; 400 curriculumId not UUID (downstream); 504 |
| 55 | GET | /curriculum/lessons | query: curriculumId* (uuid), chapterId (uuid), page (1), limit (1-100, 10) | 200 · {lessons[], pagination} | 401; 422 curriculumId not UUID; 400 if shadowed by GET /curriculum/:id with id "lessons" (probable, not verified); 504 |
| 56 | GET | /curriculum/lessons/:id | path: id | 200 · lesson row; null when not found | 401; 400 id not UUID; 504 |
| 57 | PUT | /curriculum/lessons/:id | path: id; body (all optional): create-lesson fields incl. curriculumId, chapterId, theoryUrls, exerciseUrls, order | 200 · updated lesson row | 401; 422 invalid URL in theoryUrls; 404 Lesson not found; 504 |
| 58 | DELETE | /curriculum/lessons/:id | path: id | 200 · true | 401; 404 Lesson not found; 504 |

## Exercises (`/exercises`)

| # | Method | Route | Request | Success response | Error codes |
|---|---|---|---|---|---|
| 59 | POST | /exercises | body: {tutorId* (uuid), studentId* (uuid), sessionId (uuid), lessonId (uuid), issueUrls[], exerciseUrls[] ({name, url, key}), status (SUBMITTED/GRADED/RESUBMIT)} | 201 · exercise detail (unreachable: payload mismatch) | 401; 422 invalid tutorId; 500 "reading 'studentId'" on every valid body; 409 already submitted (after fix); 504. 403/404 unreachable until fixed |
| 60 | GET | /exercises | query: page (1), limit (1-100, 10), sessionId, studentId, classId, tutorId (uuid) | 200 · {data[], pagination} (unreachable today) | 401; 422 invalid classId; 500 "Cannot destructure property 'page'" on every valid call; 504 |
| 61 | GET | /exercises/:id | path: id | 200 · exercise detail (score number or null) | 401; 400 id not UUID; 404 Exercise not found (or caller is neither tutor nor student); 504 |
| 62 | PATCH | /exercises/:id/submit | path: id; body: {exerciseUrls* (min 1) of {name, url, key}} | 200 · exercise detail, status SUBMITTED | 401; 422 empty exerciseUrls; 403 caller is not the row's student; 400 already graded; 504 |
| 63 | PATCH | /exercises/:id/grade | path: id; body: {score* (0-10), comment (max 2000)} | 200 · exercise detail, status GRADED, score number | 401; 422 score above 10; 403 caller is not the assigned tutor (no gateway role check); 404 Exercise not found; 504 |

## Notifications (`/notifications`)

| # | Method | Route | Request | Success response | Error codes |
|---|---|---|---|---|---|
| 64 | POST | /notifications | body: {type* (SYSTEM/TUITION/STUDENT/TUTOR), title* (1-255), content*, subContent (max 255), senderId, userId, classId, studentId (uuid), redirectUrl (max 500), actionLabel (max 100), actionType (VIEW/CONTACT/PAYMENT/UPDATE), metadata{}} | 201 · notification row | 401; 422 missing title; 400 "userId is not valid" when senderId omitted (downstream checks senderId); 504 |
| 65 | GET | /notifications | query: page (1), limit (1-100, 10), search, type (same enum as #64), isRead (any non-empty string coerces to true) | 200 · {data[], pagination} | 401; 422 (e.g. limit=500); 504 |
| 66 | PATCH | /notifications/read-all | none | 200 · [] (inferred; no row count returned) | 401; 504 |
| 67 | GET | /notifications/:id | path: id (no ownership check at gateway) | 200 · notification row | 401; 404 Notification not found; 504 |
| 68 | PATCH | /notifications/:id/read | path: id (no ownership check at gateway) | 200 · notification row with isRead true (readAt stays null) | 401; 404 Notification not found; 504 |
| 69 | DELETE | /notifications/:id | path: id (no ownership check at gateway) | 200 · {id} | 401; 404 Notification not found; 504 |

## Schedules (`/schedules`)

Routes 70, 71, 72, 75 and 76 are broken today: the gateway sends `{userId, ...}` but the handler reads `payload.data` or `payload.query`. Route 76 is the exception that works.

| # | Method | Route | Request | Success response | Error codes |
|---|---|---|---|---|---|
| 70 | POST | /schedules | body: {classId* (uuid), dayOfWeek* (MONDAY to SUNDAY), startTime* (HH:mm), endTime* (HH:mm), format (ONLINE/OFFLINE, ONLINE), location} | 201 · schedule row (unreachable) | 401; 422 bad time format; 500 "reading 'classId'" always; 504 |
| 71 | POST | /schedules/bulk | body: {classId* (uuid), schedules* (1-7 of {dayOfWeek*, startTime*, endTime*, format, location})} | 201 · array of schedule rows (inferred; unreachable) | 401; 422 empty schedules; 500 "reading 'classId'" always; 504 |
| 72 | GET | /schedules | query: page (1), limit (1-100, 10), search, classId (uuid) | 200 · {schedules[], pagination} (inferred; unreachable) | 401; 422 (e.g. limit=0); 500 "Cannot destructure property 'page'" always; 504 |
| 73 | GET | /schedules/class/:classId | path: classId (validated downstream) | 200 · array of schedule rows, ordered by day and start time (owner only) | 401; 400 classId not UUID; 404 Class not found (not owner); 504 |
| 74 | GET | /schedules/:id | path: id | 200 · schedule row | 401; 400 id not UUID; 404 Schedule not found; 504 |
| 75 | PATCH | /schedules/:id | path: id; body (all optional): create-schedule fields except classId | 200 · updated schedule row (inferred; unreachable) | 401; 422 bad time format; 404 Schedule not found; 500 "reading 'dayOfWeek'" for any owned schedule; 504 |
| 76 | DELETE | /schedules/:id | path: id | 200 · {id} | 401; 400 id not UUID; 404 Schedule not found; 504 |

## Sessions (`/sessions`)

Routes 77, 78, 79, 82 are broken today (handler reads `payload.data` or `payload.query`). Routes 80 and 81 work. Students and parents see `exerciseUrls: []` on route 81 until the session is COMPLETED.

| # | Method | Route | Request | Success response | Error codes |
|---|---|---|---|---|---|
| 77 | POST | /sessions | body: {classId* (uuid), sessionNumber* (int, min 1), startAt*, endAt* (datetimes), lessonId, tutorId (uuid), title (max 255), description, location, note, theoryUrls[], exerciseUrls[] (default []), status (SCHEDULED/ONGOING/COMPLETED/CANCELLED/POSTPONED, SCHEDULED), actualStartAt, actualEndAt, exerciseDueAt, objectives[], agenda[{time, title, description}]} | 201 · session row (inferred; unreachable) | 401; 422 sessionNumber below 1; 500 "reading 'classId'" always; 504 |
| 78 | POST | /sessions/bulk | body: {classId* (uuid), sessions* (1-50, each as #77 without classId)} | 201 · array of session rows (inferred; unreachable) | 401; 422 empty sessions; 500 "reading 'classId'" always; 504 |
| 79 | GET | /sessions | query: page (1), limit (1-100, 10), search, status (enum as #77), classId (uuid), startDate, endDate (dates) | 200 · {sessions[], pagination} (inferred; unreachable) | 401; 422 invalid status; 500 "Cannot destructure property 'page'" always; 504 |
| 80 | GET | /sessions/class/:classId | path: classId (validated downstream) | 200 · array of session rows ordered by sessionNumber, startAt (owner only) | 401; 400 classId not UUID; 404 Class not found (not owner); 504 |
| 81 | GET | /sessions/:id | path: id | 200 · session detail with class and lesson (lesson null if none linked) | 401; 400 id not UUID; 404 Session not found (unknown or no access); 504 |
| 82 | PUT | /sessions/:id | path: id; body (all optional): create-session fields except classId | 200 · updated session row (inferred; unreachable) | 401; 422 invalid status; 404 Session not found; 500 "reading 'lessonId'" for any owned session; 504 |
| 83 | DELETE | /sessions/:id | path: id | 200 · {id} | 401; 400 id not UUID; 404 Session not found; 504 |

## Students (`/students`)

Routes 84, 87 always return 400 (id vs field/value mismatch). Route 85 cannot succeed (no password sent; firstName/lastName never set). Route 88 returns 200 but drops most keys.

| # | Method | Route | Request | Success response | Error codes |
|---|---|---|---|---|---|
| 84 | GET | /students/get-student-code | none | 200 · unreachable (always errors) | 401; 400 always ("Unsupported field: undefined"); 504 |
| 85 | POST | /students | body: {studentName* (1-255), email, userCode (1-50), gender (MALE/FEMALE/OTHER), studentPhone, school, parentName (1-255), parentRelationship (FATHER/MOTHER/GUARDIAN), parentPhone, parentEmail} | 201 · {message, data{email, fullName, password (bcrypt hash)}} (inferred; broken) | 401; 422 studentName missing; 400 Email already exists; 500 "data and salt arguments required" when email is free (inferred); 504 |
| 86 | GET | /students | query: page (1), limit (1-100, 10), search, tutorId (uuid), gender, isActive (true/false) | 200 · {data[{id, email, name, role, status, createdAt}], pagination} | 401; 422 isActive=yes; 504 |
| 87 | GET | /students/:id | path: id | 200 · array of full user rows incl. password hash (inferred; unreachable) | 401; 400 always ("Unsupported field: undefined"); 504 |
| 88 | PUT | /students/:id | path: id; body (non-strict; unknown keys dropped): studentName, studentPhone, gender, birthday, school, address (max 500), district, province (max 30), parentName, parentPhone, parentEmail, parentRelationship, parentAddress, parentDistrict, parentProvince, avatar (URL or null) | 200 · full updated user row incl. password hash; only gender, school, address, district, province, avatar persist | 401; 422 avatar not a URL; 400 id not UUID; 400 User not found; 504 |
| 89 | DELETE | /students/:id | path: id | 200 · {id} | 401; 400 id not UUID; 400 User not found; 504 |

## Tuitions (`/tuitions`)

Routes 91, 92, 93 always return 400 (no userId sent). Create, update and delete work.

| # | Method | Route | Request | Success response | Error codes |
|---|---|---|---|---|---|
| 90 | POST | /tuitions | body: {classId* (uuid), studentId* (uuid), amount* (min 0), dueDate, paidDate, status (PAID/UNPAID/OVERDUE, UNPAID), note} | 201 · tuition row with class and student | 401; 422 negative amount; 404 Class not found (caller not class tutor); 504 |
| 91 | GET | /tuitions/summary | query: classId (raw, not validated) | 200 · {totalPaid, totalUnpaid, totalOverdue, totalRevenue} (inferred; unreachable) | 401; 400 always (no userId); 504 |
| 92 | GET | /tuitions | query: page (1), limit (1-100, 10), classId (uuid), studentId (uuid), status (PAID/UNPAID/OVERDUE) | 200 · {tuitions[], pagination} (inferred; unreachable) | 401; 422 invalid status; 400 always (no userId); 504 |
| 93 | GET | /tuitions/:id | path: id | 200 · tuition row (inferred; unreachable) | 401; 400 always (no userId); 504 |
| 94 | PUT | /tuitions/:id | path: id; body (all optional): create-tuition fields except classId and studentId | 200 · tuition row with class and student | 401; 422 invalid status; 400 id not UUID; 404 Tuition record not found; 404 Class not found (not class tutor); 504 |
| 95 | DELETE | /tuitions/:id | path: id | 200 · {id} | 401; 400 id not UUID; 404 Tuition record not found; 404 Class not found; 504 |

## Dashboard, email, logs, redis, reports

| # | Method | Route | Request | Success response | Error codes |
|---|---|---|---|---|---|
| 96 | GET | /dashboard/overview | none (userId from token) | 200 · {role, stats{...}, todaySchedule[], upcomingSchedule[], monthly[]} | 401; 404 User not found (downstream); 400 userId not UUID; 504 |
| 97 | GET | /emails | none (public; sends a real test email) | 200 · {id} Resend result (inferred) | 500 Resend rejects (e.g. invalid key), message from Resend; 504 |
| 98 | GET | /logs | query: page (1), limit (1-100, 20), serviceName, type (HTTP/RPC), correlationId, search | 200 · {data[] request_log rows, pagination} | 401; 403 not ADMIN; 422 limit=500; 504 |
| 99 | GET | /logs/trace/:correlationId | path: correlationId (not validated) | 200 · array of request_log rows, oldest first; [] if unknown | 401; 403 not ADMIN; 504 |
| 100 | GET | /logs/stats | none | 200 · array of {method, path, calls24h, errorCount24h, p95Ms} | 401; 403 not ADMIN; 504 |
| 101 | GET | /redis | query: key* (string, min 1) | 200 · raw stored string, or null if key missing | 401; 422 missing key; 500 WRONGTYPE for non-string key; 504 |
| 102 | GET | /reports/learning/summary | none | 200 · {activeClasses, avgAttendanceRate, avgCurriculumProgress, submissionRate} | 401; 403 not ADMIN; 504 |
| 103 | GET | /reports/learning/attendance-trend | none | 200 · array of 6 {month "MM/YYYY", rate}, oldest first | 401; 403 not ADMIN; 504 |
| 104 | GET | /reports/learning/classes | query: page (1), limit (1-100, 10), search | 200 · {data[] class report rows, pagination} | 401; 403 not ADMIN; 422 limit=0; 504 |

## Test scenarios (`/test-scenarios`)

Class-level RolesGuard (ADMIN). Every route returns 403 for non-admin callers.

| # | Method | Route | Request | Success response | Error codes |
|---|---|---|---|---|---|
| 105 | GET | /test-scenarios/routes | none | 200 · route catalog [{method, path, summary, tag, params, uuidParams, isPublic, roles, multipart, oauth}] | 401; 403 |
| 106 | POST | /test-scenarios/generate | body: routes[] (max 500, {method, path}, default all non-test routes), categories[] (valid/auth/validation/not_found/domain, min 1) | 200 · {scenarios[], fixtures[]}; nothing saved | 401; 403; 422 bad category; 504 |
| 107 | POST | /test-scenarios/bulk | body: {scenarios* (1-500 of the #114 create shape)} | 201 · {created, skipped} (duplicates on method+path+name skipped) | 401; 403; 422 empty scenarios; 504 |
| 108 | GET | /test-scenarios/auth-profiles | none | 200 · array of {profile, configured, email} | 401; 403; 504 |
| 109 | GET | /test-scenarios/fixtures | none | 200 · array of fixture rows {id, key, description, value, resolver, resolvedAt, createdAt, updatedAt} | 401; 403; 504 |
| 110 | POST | /test-scenarios/fixtures | body: {key* (regex ^[A-Za-z][A-Za-z0-9_]{0,99}$), description (max 500), value (max 2000, nullable), resolver ({method (GET), path (single leading /), authProfile (admin), extract (1-200)}); value or resolver required} | 201 · created fixture row | 401; 403; 422 bad key or neither value nor resolver; 409 key already exists; 504 |
| 111 | PATCH | /test-scenarios/fixtures/:id | path: id* (uuid); body (all optional): fixture fields | 200 · updated fixture row (changing resolver without value clears cached value) | 401; 403; 400 id not UUID; 422 validation; 404 Test fixture not found; 409 key already exists; 504 |
| 112 | DELETE | /test-scenarios/fixtures/:id | path: id* (uuid) | 200 · deleted fixture row | 401; 403; 400 id not UUID; 404 Test fixture not found; 504 |
| 113 | POST | /test-scenarios/fixtures/:id/resolve | path: id* (uuid); optional Authorization header (forwarded as accessToken) | 200 · fixture row with refreshed value and resolvedAt (fixed fixtures returned as-is) | 401; 403; 400 id not UUID or resolver call failed; 404 Test fixture not found; 504 |
| 114 | POST | /test-scenarios | body: {service* (1-50), method* (GET/POST/PUT/PATCH/DELETE), path* (single leading /), name* (1-200), description, requestTemplate ({headers, body}, {}), expectedStatus* (100-599), category (valid/auth/validation/not_found/domain, valid), authProfile (caller/admin/tutor/student/parent/none, caller)} | 201 · scenario row (no duplicate check on this route) | 401; 403; 422 validation (e.g. bad method); 504 |
| 115 | GET | /test-scenarios | query: service, method, path, category (enum) | 200 · array of scenario rows with lastRun and flow[] | 401; 403; 422 bad category; 504 |
| 116 | GET | /test-scenarios/meta | none | 200 · {environment} (APP_ENV, else NODE_ENV, else "development") | 401; 403 |
| 117 | GET | /test-scenarios/stats | none | 200 · array of {method, path, casesTotal, casesPassed} | 401; 403; 504 |
| 118 | GET | /test-scenarios/:id/runs | path: id* (uuid); query: limit (int, default 20) | 200 · array of test_runs rows, newest first | 401; 403; 400 id not UUID or limit not integer; 404 Test scenario not found; 504 |
| 119 | PATCH | /test-scenarios/:id | path: id* (uuid); body (all optional): any #114 field | 200 · updated scenario row | 401; 403; 400 id not UUID; 422 validation (e.g. expectedStatus 99); 404 Test scenario not found; 504 |
| 120 | DELETE | /test-scenarios/:id | path: id* (uuid) | 200 · deleted scenario row (runs removed by FK cascade) | 401; 403; 400 id not UUID; 404 Test scenario not found; 504 |
| 121 | POST | /test-scenarios/:id/run | path: id* (uuid); query: async ("true" returns immediately); Authorization header forwarded | 200 · test_runs row (sync) or {correlationId, scenarioId} (async=true); transport or setup failure is a 200 with passed false | 401; 403; 400 id not UUID; 404 Test scenario not found; 504 sync run over 10 s (retry re-executes) |

## Upload (`/upload`)

All four routes are @Public. Every real upload and download fails today (Buffer contract mismatch between gateway and third-service).

| # | Method | Route | Request | Success response | Error codes |
|---|---|---|---|---|---|
| 122 | POST | /upload | multipart: file* (single file, no size or type limit) | 201 · {url, key, size, mimetype} (intended; unreachable) | 500 "reading 'originalname'" when no file; 500 Buffer argument error on every real upload; 504 (large file) |
| 123 | POST | /upload/multiple | multipart: files* (up to 10) | 201 · array of {url, key, size, mimetype} (intended; unreachable) | 500 "reading 'map'" when no files; 500 Buffer argument error on every real upload; 504; Multer errors not mapped |
| 124 | GET | /upload/download | query: key* (string, not validated) | 200 · raw binary, application/octet-stream, attachment (intended; unreachable) | 500 on every call (reads result.buffer, reply has content); 500 missing R2 object (inferred); 504 |
| 125 | DELETE | /upload/:key | path: key* (URL-encode "/" as %2F) | 200 · null (intended; reply is empty) | 500 "no elements in sequence" (empty reply, though object is deleted); 504 |

## Users (`/users`)

| # | Method | Route | Request | Success response | Error codes |
|---|---|---|---|---|---|
| 126 | GET | /users | query: page (1), limit (1-100, 10; pageSize alias), search, role (ADMIN/TUTOR/PARENT/STUDENT), isActive (true/false) | 200 · {data[{id, email, name, role, status, createdAt}], pagination} | 401; 422 (e.g. limit=500); 504 |
| 127 | GET | /users/detail-user | none (current user from token) | 200 · user row without password, or null if user missing | 401 no/invalid token or session expired; 400 token subject not UUID; 504 |
| 128 | GET | /users/get-by-field | query: field* (id/email/username/phone/userCode), value* | 200 · array of full user rows incl. password hash; [] if no match | 401; 422 value missing; 400 unsupported field; 504 |
| 129 | POST | /users | body: {email*, firstName* (2-100), lastName* (2-100), password* (6-20), username, role (ADMIN/TUTOR/PARENT/STUDENT, STUDENT), isActive (true), avatar, dateOfBirth (Date); other profile fields validated but dropped} | 201 · {message, data{email, fullName, password (bcrypt hash)}} | 401; 422 short password or invalid field; 400 email or username exists; 504 |
| 130 | PUT | /users | body (strict, all optional): email, username, firstName, lastName, avatar, phone, isActive, role, description, userCode, gender, dateOfBirth, address, district, province, subjects, facebookId, googleId, school, relationship, classId, parentId, tutorId, gradesId[]; password rejected | 200 · full updated user row incl. password hash | 401; 422 unknown key (e.g. password); 400 student renaming own first or last name; 400 User not found; 504 |
| 131 | PUT | /users/:id | path: id (no UUID pipe at gateway); body as #130 (strict) | 200 · full updated user row incl. password hash; role persisted | 401; 422 unknown key; 400 id not UUID; 400 User not found (not 404); 504 |
| 132 | PUT | /users/:id/status | path: id (no body) | 200 · updated user row with isActive flipped (not idempotent) | 401; 400 id not UUID; 400 User not found; 504 |
| 133 | DELETE | /users/:id | path: id | 200 · {id} (hard delete; children cascade) | 401; 400 id not UUID; 400 User not found; 504 |
| 134 | POST | /users/change-password | body: {currentPassword* (min 1), newPassword* (8-14, lower, upper, digit, special)} | 200 · {message: "Password changed successfully"} | 401 wrong current password; 401 session expired; 422 weak newPassword; 400 User not found; 504 |
