# Docker Compose Setup

> Compose chung nằm ở `gateway/docker-compose.yml`, env ở `gateway/.env.compose` (`.env` của gateway là env riêng của service). Mọi lệnh chạy từ thư mục `gateway/`. `context` build của các service khác trỏ `../USER`, `../tutor-service`, `../THIRD_SERVICE`, `../TUTOR-UI`. `gateway/docker-compose.infra.yml` chỉ chứa hạ tầng (postgres/redis/rabbitmq) để chạy dev riêng.

Hệ thống gồm 4 services (gateway, user, tutor, third) + 1 UI + 3 infra (postgres, redis, rabbitmq).

## Cấu trúc

### UI Layer
- `tutor-ui` — React frontend (port 3000)

### API Services
- `app-gateway` — HTTP entry point (port 8888)
- `app-user-service` — Auth + user management (port 4001)
- `app-tutor-service` — Tutor/education domain (port 4002)
- `app-third-service` — Email, upload, notification, redis KV (port 4003)

### Infrastructure
- `app-postgres` — PostgreSQL 16 (port 5432)
- `app-redis` — Redis cache (port 6379)
- `app-rabbitmq` — RabbitMQ message queue (port 5672, management UI 15672)

## Cách dùng

### Setup

```bash
# Copy .env từ .env.example
cp .env.compose.example .env.compose

# Edit .env nếu cần (secrets, external URLs, etc.)
nano .env.compose

# Build tất cả images
docker compose --env-file .env.compose build

# Start tất cả services
docker compose --env-file .env.compose up -d

# Check logs
docker compose --env-file .env.compose logs -f

# Stop tất cả
docker compose --env-file .env.compose down
```

### Access Points

- **UI**: http://localhost:3000
- **Gateway API**: http://localhost:8888
- **User Service**: http://localhost:4001
- **Tutor Service**: http://localhost:4002
- **Third Service**: http://localhost:4003
- **RabbitMQ Management**: http://localhost:15672 (admin/admin)
- **Database**: localhost:5432

### Health Checks

Mỗi service có `healthcheck`. Xem status:

```bash
docker compose --env-file .env.compose ps

# Hoặc kiểm tra chi tiết
docker inspect app-user-service | jq '.State.Health'
```

## Network

Tất cả services kết nối qua network `app-network` (bridge). Các service gọi nhau qua service name:
- Gateway call user-service: `http://user-service:4001`
- Gateway call tutor-service: `http://tutor-service:4002`
- Bất kỳ service call redis: `redis:6379`
- Bất kỳ service call postgres: `postgres:5432`
- Bất kỳ service call rabbitmq: `rabbitmq:5672`

## Volumes

- `postgres_data` — Database persistence
- `redis_data` — Redis persistence (nếu cấu hình)
- `rabbitmq_data` — RabbitMQ persistence

## Environment Variables

Copy `.env.compose.example` → `.env` và điền:

| Variable | Dùng cho | Bắt buộc |
|----------|---------|---------|
| `POSTGRES_*` | Database config | Yes |
| `REDIS_*` | Cache config | Optional |
| `RABBITMQ_*` | Message queue config | Yes |
| `JWT_ACCESS_SECRET` | Gateway + all services | Yes |
| `JWT_REFRESH_SECRET` | Gateway + all services | Yes |
| `RESEND_API_KEY` | Email via third-service | Optional |
| `CLOUDFLARE_R2_*` | File upload via third-service | Optional |
| `REACT_APP_API_URL` | UI API endpoint | Yes |

## Common Commands

```bash
# Rebuild service
docker compose --env-file .env.compose build user-service

# Restart service
docker compose --env-file .env.compose restart user-service

# View logs
docker compose --env-file .env.compose logs user-service -f

# Execute command in container
docker compose --env-file .env.compose exec user-service npm run test

# Remove all containers/volumes
docker compose --env-file .env.compose down -v

# Prune unused images
docker image prune -a
```

## Troubleshooting

### "port already in use"
Kiểm tra xem port nào đang dùng:
```bash
lsof -i :8888  # port 8888
```
Thay đổi port trong docker-compose.yml hoặc kill process

### "can't connect to database"
Chắc chắn postgres container chạy:
```bash
docker compose --env-file .env.compose ps postgres
docker compose --env-file .env.compose logs postgres
```

### "RabbitMQ connection refused"
```bash
docker compose --env-file .env.compose logs rabbitmq
docker compose --env-file .env.compose restart rabbitmq
```

### Services can't communicate
Kiểm tra network:
```bash
docker network inspect app-network
```

## Service Dependencies

Các service phụ thuộc vào infra:
```
gateway/user/tutor/third-service
    ↓
postgres + redis + rabbitmq
```

UI phụ thuộc vào gateway:
```
tutor-ui
    ↓
gateway
```

Docker-compose sẽ tự start dependencies trước (via `depends_on`).

## Production

Trong production, thay đổi:
- `NODE_ENV=production`
- `restart: on-failure` hoặc `restart: always`
- Dùng secret management (Docker Secrets, HashiCorp Vault)
- Scale services (`docker compose --env-file .env.compose up --scale user-service=3`)
- Health checks thường xuyên monitor

## Lưu ý đã gặp

- **Healthcheck**: image alpine không có `curl` và các service không có route `/health`. Healthcheck dùng `nc -z localhost <port>` (cả Dockerfile lẫn compose).
- **Env trong container**: `.env` từng service trỏ `localhost`; compose override `POSTGRES_HOST`, `DATABASE_URL`, `REDIS_HOST`, `RABBITMQ_URL` sang tên container.
- **Database**: mỗi service dùng DB riêng (`user_db`, `tutor_db`, `third_db`, `gateway_db`). Tạo DB rồi migrate từ `gateway/`:
  ```bash
  docker exec app-postgres psql -U postgres -c "CREATE DATABASE user_db"
  DATABASE_URL=postgresql://postgres:postgres@localhost:5432/user_db npx drizzle-kit migrate
  ```
- **Port 5672/3000 bị chiếm**: container `rabbitmq` của project khác hoặc `next-server` local. Dừng chúng hoặc đổi `RABBITMQ_PORT` trong `.env.compose`.
