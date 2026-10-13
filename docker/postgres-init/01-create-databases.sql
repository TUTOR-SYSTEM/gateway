-- Chạy tự động khi Postgres khởi tạo volume MỚI (docker-entrypoint-initdb.d).
-- Mỗi service trong docker-compose.yml có DATABASE_URL riêng trỏ tới DB này.
-- Volume đã tồn tại thì không chạy lại; khi đó tạo tay:
--   docker exec tutor-postgres-1 psql -U postgres -c "CREATE DATABASE user_db"
SELECT 'CREATE DATABASE user_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'user_db')\gexec
SELECT 'CREATE DATABASE tutor_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'tutor_db')\gexec
SELECT 'CREATE DATABASE third_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'third_db')\gexec
