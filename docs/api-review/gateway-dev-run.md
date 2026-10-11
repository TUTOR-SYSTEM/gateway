# Gateway dev run: real requests and responses

- **Date:** 2026-10-10. **Target:** gateway `http://localhost:8888` (dev), DB `backends_db` at `localhost:5432` (Docker container `tutor-postgres-1`).
- **Seeded (idempotent scripts, `USER/scripts`):** `seed-user.ts` created `chienbinhthephai@gmail.com` (TUTOR), `student@finance.dev` (STUDENT, userCode `ABC123`), `parent@finance.dev` (PARENT, userCode `ABC456`); `dang04223@gmail.com` (ADMIN) already existed. `seed-grades.ts` created grades Lớp 5 to Lớp 12.
- **Side effects of this run:** created `tester1@finance.dev` (register OK), `stu2@finance.dev` (user create OK), class `TOAN6A` was NOT created (validation failed). Notification and other writes were not made.
- **Method:** each request was sent with `curl`/`urllib` to the live gateway. Status and body are the real responses. Body column shows what was sent. `*` in the table is not used here.

## Sample from the request

Your example body was `{email:'dang123@gmail.com', password:'123'}` (not valid JSON; sent as proper JSON below). Real results:

| Route | Body sent | HTTP | Real response (message / errors) | Error code |
|---|---|---|---|---|
| POST /auth/register | `{"email": "dang123@gmail.com", "password": "123", "firstName": "Dang", "lastName": "Nguyen"}` | 422 | err: {"message": "Dữ liệu không hợp lệ", "errors": [{"field": "password", "message": "Mật khẩu phải có ít nhất 6 ký tự", "code": "too_small"}]} | 422 |
| POST /auth/change-password | `{"currentPassword": "Student@123456", "newPassword": "123"}` | 404 | err: {"message": "Cannot POST /auth/change-password"} | 404 |
| POST /users | `{"email": "stu2@finance.dev", "password": "123", "firstName": "Stu", "lastName": "Two", "role": "STUDENT"}` | 422 | err: {"message": "Dữ liệu không hợp lệ", "errors": [{"field": "password", "message": "Password must be at least 6 characters", "code": "too_small"}]} | 422 |
| POST /users/change-password | `{"currentPassword": "Student@123456", "newPassword": "123"}` | 422 | err: {"message": "Dữ liệu không hợp lệ", "errors": [{"field": "newPassword", "message": "Password must be at least 8 characters", "code": "too_small"}]} | 422 |

## All real results

| # | Route | Auth | Body / query sent | HTTP | Real response (excerpt) | Note |
|---|---|---|---|---|---|---|
| 1 | POST /auth/register | - | `{"email": "dang123@gmail.com", "password": "123", "firstName": "Dang", "lastName": "Nguyen"}` | 422 | err: {"message": "Dữ liệu không hợp lệ", "errors": [{"field": "password", "message": "Mật khẩu phải có ít nhất 6 ký tự", "code": "too_small"}]} | register weak pw (user example) |
| 2 | POST /auth/register | - | `{"email": "tester1@finance.dev", "password": "Tester@123", "firstName": "Test", "lastName": "One"}` | 200 | data: {"user": {"id": "0d64a39f-a0e4-49f2-abb5-e737091ffd29", "email": "tester1@finance.dev", "username": "onetest", "firstName": "Test", "lastName": "One"}} | register ok |
| 3 | POST /auth/register | - | `{"email": "dang04223@gmail.com", "password": "Admin@123456", "firstName": "Admin", "lastName": "Account"}` | 400 | err: {"message": "Email đã tồn tại"} | register duplicate |
| 4 | POST /auth/login | - | `{"email": "dang04223@gmail.com", "password": "Admin@123456"}` | 200 | data: {"accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmZDY5OGY3YS1lMzQ4LTQxYjEtOWVmMC1kNWEwYTVhY2I5ZjciLCJlbWFpbCI6ImRhbmcwNDIyM0BnbWFpbC5jb20iLCJyb2xlIjoiQURNSU4iLCJ0eXAiOiJhY2Nlc3MiLCJpYXQiOjE3OTE2MzE1… | login ok |
| 5 | POST /auth/login | - | `{"email": "nobody@x.com", "password": "Admin@123"}` | 400 | err: {"message": "Không tìm thấy người dùng"} | login user not found |
| 6 | POST /auth/login | - | `{"email": "dang04223@gmail.com", "password": "Wrong@123"}` | 400 | err: {"message": "Mật khẩu không đúng"} | login wrong password |
| 7 | POST /auth/login/user-code | - | `{"userCode": "ABC123", "password": "Student@123456", "role": "STUDENT"}` | 400 | err: {"message": "Không tìm thấy người dùng"} | login user-code student |
| 8 | POST /auth/login/user-code | - | `{"userCode": "ABC123", "password": "Student@123456", "role": "TUTOR"}` | 422 | err: {"message": "Dữ liệu không hợp lệ", "errors": [{"field": "role", "message": "Invalid option: expected one of \"PARENT\"\|\"STUDENT\"", "code": "invalid_value"}]} | login user-code tutor role (rejected) |
| 9 | POST /auth/forgot-password | - | `{"email": "nobody@x.com"}` | 400 | err: {"message": "Không tìm thấy người dùng"} | forgot-password unknown email |
| 10 | POST /auth/forgot-password | - | `{"email": "not-an-email"}` | 422 | err: {"message": "Dữ liệu không hợp lệ", "errors": [{"field": "email", "message": "Email không hợp lệ", "code": "invalid_format"}]} | forgot-password invalid email |
| 11 | GET /users/detail-user | admin | `-` | 200 | data: {"id": "fd698f7a-e348-41b1-9ef0-d5a0a5acb9f7", "email": "dang04223@gmail.com", "username": "admin", "firstName": "Admin", "lastName": "Account", "avatar": null, "phone": null, "isActive": true, "role": "ADMIN", "de… | detail-user admin |
| 12 | GET /users/detail-user | - | `-` | 401 | err: {"message": "Unauthorized ..."} | detail-user no token |
| 13 | GET /users/detail-user | student | `-` | 200 | data: {"id": "7fcca22a-c9f8-4b8a-98e1-642b2c91d995", "email": "student@finance.dev", "username": "student", "firstName": "Student", "lastName": "Account", "avatar": null, "phone": null, "isActive": true, "role": "STUDENT… | detail-user bad token |
| 14 | POST /auth/change-password | student | `{"currentPassword": "Nope@123", "newPassword": "Student@999"}` | 404 | err: {"message": "Cannot POST /auth/change-password"} | change-password wrong current |
| 15 | POST /auth/change-password | student | `{"currentPassword": "Student@123456", "newPassword": "123"}` | 404 | err: {"message": "Cannot POST /auth/change-password"} | change-password weak new (422) |
| 16 | POST /classes | tutor | `{"name": "Toán 6A", "gradesId": [], "description": "Lớp toán"}` | 422 | err: {"message": "Dữ liệu không hợp lệ", "errors": [{"field": "code", "message": "Invalid input: expected string, received undefined", "code": "invalid_type"}, {"field": "subject", "message": "Subject is required", "code… | create class (tutor) |
| 17 | GET /classes?page=1&limit=10 | admin | `-` | 200 | data: {"classes": [], "pagination": {"total": 0, "page": 1, "limit": 10, "totalPages": 0}} | list classes (admin) |
| 18 | POST /users | admin | `{"email": "stu2@finance.dev", "password": "123", "firstName": "Stu", "lastName": "Two", "role": "STUDENT"}` | 422 | err: {"message": "Dữ liệu không hợp lệ", "errors": [{"field": "password", "message": "Password must be at least 6 characters", "code": "too_small"}]} | create student user (admin, weak pw) |
| 19 | POST /notifications | admin | `{"type": "SYSTEM", "title": "Chào", "content": "Nội dung test"}` | 400 | err: {"message": "userId không hợp lệ"} | create notification (no userId) |
| 20 | GET /notifications?page=1&limit=10 | admin | `-` | 500 | err: {"message": "Cannot destructure property 'page' of 'query' as it is undefined."} | notifications list |
| 21 | GET /users/get-by-field?field=email&value=student@finance.dev | admin | `-` | 200 | data: [{"id": "7fcca22a-c9f8-4b8a-98e1-642b2c91d995", "email": "student@finance.dev", "username": "student", "firstName": "Student", "lastName": "Account", "password": "$2b$10$v1dqCBsOMU2BY5IjRnet4eVUi0Cp8E.IlroUXAdOjBj9… | get-by-field email |
| 22 | GET /students?page=1&limit=10 | admin | `-` | 200 | data: {"data": [{"id": "0d64a39f-a0e4-49f2-abb5-e737091ffd29", "email": "tester1@finance.dev", "name": "Test One", "role": "TUTOR", "status": "active", "createdAt": "2026-10-10T11:25:22.481Z"}, {"id": "8af6ddcf-1422-4a82… | students list (admin) |
| 23 | GET /sessions | admin | `-` | 500 | err: {"message": "Cannot read properties of undefined (reading 'page')"} | sessions list |
| 24 | GET /schedules | admin | `-` | 500 | err: {"message": "Cannot read properties of undefined (reading 'page')"} | schedules list |
| 25 | GET /tuitions | admin | `-` | 400 | err: {"message": "ID người dùng phải là UUID"} | tuitions list |
| 26 | GET /admin/tutors | admin | `-` | 200 | data: {"data": [{"id": "0d64a39f-a0e4-49f2-abb5-e737091ffd29", "email": "tester1@finance.dev", "name": "Test One", "role": "TUTOR", "status": "active", "createdAt": "2026-10-10T11:25:22.481Z"}, {"id": "8af6ddcf-1422-4a82… | admin tutors list |
| 27 | GET /logs?page=1&limit=5 | admin | `-` | 500 | err: {"message": "Failed query: select \"id\", \"service_name\", \"type\", \"method\", \"path\", \"status_code\", \"duration_ms\", \"correlation_id\", \"trace_id\", \"parent_trace_id\", \"user_id\", \"ip\", \"request_bod… | logs (admin) |
| 28 | GET /logs?page=1&limit=5 | tutor | `-` | 403 | err: {"message": "You do not have permission to access this resource"} | logs (tutor, role denied) |
| 29 | GET /redis?key=foo | admin | `-` | 200 | data: null | redis get (admin) |
| 30 | POST /upload | - | `-` | 500 | err: {"message": "Cannot read properties of undefined (reading 'originalname')"} | upload file (public) |
| 31 | POST /users/change-password | student | `{"currentPassword": "Nope@123", "newPassword": "Student@999"}` | 401 | err: {"message": "Mật khẩu hiện tại không đúng"} | change-password wrong current |
| 32 | POST /users/change-password | student | `{"currentPassword": "Student@123456", "newPassword": "123"}` | 422 | err: {"message": "Dữ liệu không hợp lệ", "errors": [{"field": "newPassword", "message": "Password must be at least 8 characters", "code": "too_small"}]} | change-password weak new (422) |
| 33 | POST /classes | tutor | `{"code": "TOAN6A", "name": "Toán 6A", "gradesId": [], "description": "Lớp toán 6"}` | 422 | err: {"message": "Dữ liệu không hợp lệ", "errors": [{"field": "subject", "message": "Subject is required", "code": "invalid_type"}, {"field": "startTime", "message": "Start time must be a valid date", "code": "invalid_ty… | create class with code |
| 34 | GET /classes/None | admin | `-` | 400 | err: {"message": "ID lớp học phải là UUID"} | get class detail (admin) |
| 35 | POST /users | admin | `{"email": "stu2@finance.dev", "password": "Student@123", "firstName": "Stu", "lastName": "Two", "role": "STUDENT"}` | 201 | data: {"message": "User created successfully", "data": {"email": "stu2@finance.dev", "fullName": "Stu Two", "password": "$2b$10$x8bwP1j5RMH0Byps2xOKNOajJM5yQDbxVJH8voaODLs5W2iSFhpE."}} | create user valid pw |
| 36 | POST /notifications | admin | `{"type": "SYSTEM", "title": "Chào", "content": "Nội dung test", "userId": "7fcca22a-c9f8-4b8a-98e1-642b2c91d995"}` | 400 | err: {"message": "userId không hợp lệ"} | create notification with userId |
| 37 | GET /users/get-by-field?field=phone&value=1 | admin | `-` | 200 | data: [] | get-by-field bad field |
| 38 | GET /sessions?page=1&limit=10 | admin | `-` | 500 | err: {"message": "Cannot read properties of undefined (reading 'page')"} | sessions list with query |
| 39 | GET /tuitions?userId=7fcca22a-c9f8-4b8a-98e1-642b2c91d995 | admin | `-` | 400 | err: {"message": "ID người dùng phải là UUID"} | tuitions with userId |
| 40 | GET /logs/stats | admin | `-` | 200 | data: [] | logs stats (admin) |
| 41 | GET /students/get-student-code | admin | `-` | 400 | err: {"message": "Trường không được hỗ trợ: undefined"} | students get-student-code |
| 42 | POST /ai-chat/chat | tutor | `{"message": "Xin chào"}` | 200 | data: {"reply": {"role": "assistant", "content": "Không có phản hồi từ trợ lý.", "createdAt": "2026-10-10T11:25:50.334Z"}, "history": [{"role": "user", "content": "Xin chào", "createdAt": "2026-10-10T11:25:50.334Z"}, {"r… | ai chat (tutor) |
| 43 | GET /health/redis | - | `-` | 200 | data: {"connection": "redis", "status": "connected", "timestamp": "2026-10-10T11:25:50.341Z", "cacheStats": {"status": "healthy", "cache": "Redis", "connection": "connected", "timestamp": "2026-10-10T11:25:50.340Z", "mes… | health redis public |
| 44 | GET /kafka/send | - | `-` | 200 | data: {"userId": "generated-uuid-1791631550345", "email": "test.kafka@example.com", "fullName": "Kafka Test", "username": "kafka_test_user", "role": "STUDENT", "processedAt": "2026-10-10T11:25:50.345Z", "receivedAt": "20… | kafka send (public) |
| 45 | GET /kafka/error | - | `-` | 400 | err: {"message": "data from user failed ..."} | kafka error (public) |
