# Docker Setup Summary

## Consolidation Complete ✓

Tất cả services, UI, database, cache, và message queue đã được group lại trong **một docker-compose.yml** duy nhất tại `gateway/`.

## Files Created/Updated

### 1. Root Docker Compose
- **`docker-compose.yml`** — Single source of truth
  - ✓ UI Layer (tutor-ui)
  - ✓ API Services (gateway, user-service, tutor-service, third-service)
  - ✓ Infrastructure (postgres, redis, rabbitmq)
  - ✓ Named volumes cho persistence
  - ✓ Single network (app-network)
  - ✓ Health checks cho tất cả services

### 2. Environment Configuration
- **`.env.compose.example`** — Template với tất cả biến cần thiết
  - Database (PostgreSQL)
  - Cache (Redis)
  - Message Queue (RabbitMQ)
  - Services (Gateway, User, Tutor, Third)
  - UI (React)
  - External services (JWT, OAuth, Email, R2)

### 3. Documentation
- **`DOCKER.md`** — Hướng dẫn dùng chi tiết
  - Cấu trúc services
  - Access points (ports, URLs)
  - Network configuration
  - Troubleshooting
  - Common commands

### 4. Dockerfiles
#### Fixed/Created:
| Service | Status | Port | Notes |
|---------|--------|------|-------|
| gateway | ✓ Created | 8888 | HTTP entry point |
| user-service | ✓ Existed | 4001 | Auth + users |
| tutor-service | ✓ Fixed | 4002 | Was incomplete |
| third-service | ✓ Created | 4003 | Email, upload, notification |
| tutor-ui | ✓ Existed | 3000 | React frontend |

#### Multi-stage builds:
```
Stage 1: Builder (full deps + TS compilation)
Stage 2: Prod-deps (runtime-only node_modules)
Stage 3: Runtime (slim Alpine image)
```

#### Health checks:
Mỗi service có HTTP health check `/health` (interval 10s, timeout 5s, retries 5)

### 5. .dockerignore Files
- **`gateway/.dockerignore`** ✓ Created
- **`THIRD_SERVICE/.dockerignore`** ✓ Created
- Existing: `USER/`, `tutor-service/`, `TUTOR-UI/`

## Architecture

```
┌─────────────────────────────────────┐
│        TUTOR-UI (React)             │ :3000
│        Port 3000                    │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│      GATEWAY (HTTP Entry)           │ :8888
│      Port 8888 → RabbitMQ           │
└──────────┬──────────┬───────┬───────┘
           │          │       │
      ┌────▼──┐  ┌────▼──┐  ┌▼─────────┐
      │ USER  │  │ TUTOR │  │ THIRD    │
      │ :4001 │  │ :4002 │  │ :4003    │
      └────┬──┘  └────┬──┘  └┬─────────┘
           │          │       │
           └──────────┼───────┘
                      │
         ┌────────────┼────────────┐
         │            │            │
    ┌────▼──┐  ┌─────▼───┐  ┌────▼────┐
    │Postgres│  │ Redis   │  │RabbitMQ │
    │:5432   │  │ :6379   │  │ :5672   │
    └────────┘  └─────────┘  └─────────┘
    (Database)  (Cache)     (Message Queue)
    
    All connected via 'app-network' bridge
```

## Network Configuration

```yaml
app-network: bridge
  - tutor-ui → gateway (depends_on)
  - gateway → {all services} (RabbitMQ RPC)
  - {all services} → postgres, redis, rabbitmq (infrastructure)
```

Services gọi nhau bằng service name (DNS):
- `http://gateway:8888`
- `http://user-service:4001`
- `postgres:5432`
- `redis:6379`
- `rabbitmq:5672`

## Volumes & Persistence

```yaml
volumes:
  postgres_data    # Database files
  redis_data       # Redis persistence
  rabbitmq_data    # RabbitMQ messages
```

## Usage

```bash
# Setup
cp .env.compose.example .env.compose
nano .env.compose  # Edit secrets, external URLs

# Start all services
docker compose --env-file .env.compose up -d

# Check status
docker compose --env-file .env.compose ps
docker compose --env-file .env.compose logs -f gateway

# Stop
docker compose --env-file .env.compose down

# Clean (remove volumes)
docker compose --env-file .env.compose down -v
```

## Port Mapping

| Service | Internal | External | Purpose |
|---------|----------|----------|---------|
| tutor-ui | 3000 | 3000 | Web app |
| gateway | 8888 | 8888 | HTTP API |
| user-service | 4001 | 4001 | User RPC |
| tutor-service | 4002 | 4002 | Tutor RPC |
| third-service | 4003 | 4003 | Third RPC |
| postgres | 5432 | 5432 | Database |
| redis | 6379 | 6379 | Cache |
| rabbitmq | 5672 | 5672 | Messaging |
| rabbitmq-mgmt | 15672 | 15672 | Management UI |

## Environment Variables

### Minimal setup:
```env
# Database
POSTGRES_PASSWORD=postgres
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/tutor_db

# RabbitMQ
RABBITMQ_URL=amqp://admin:admin@rabbitmq:5672

# JWT
JWT_ACCESS_SECRET=dev-access-secret
JWT_REFRESH_SECRET=dev-refresh-secret

# UI
REACT_APP_API_URL=http://localhost:8888
```

### Full setup (see `.env.compose.example`):
- JWT tokens
- Google/Facebook OAuth
- Email (Resend)
- File upload (Cloudflare R2)
- Redis config

## Key Changes from Original Setup

### Before: Scattered
```
USER/docker-compose.yml        (user + postgres + redis + rabbitmq)
tutor-service/docker-compose.yml (only infrastructure)
gateway/docker-compose.infra.yml (only infrastructure)
THIRD_SERVICE/docker-compose.yml (only infrastructure)
```

### After: Consolidated
```
gateway/docker-compose.yml (ALL services + infrastructure)
gateway/.env.compose.example (centralized env vars)
```

## Consistency Improvements

✓ Single network name: `app-network`
✓ Container naming: `app-{service}` prefix
✓ Consistent port for Redis: 6379
✓ All services have health checks
✓ All services depend on infrastructure (postgres, redis, rabbitmq)
✓ Proper build context & Dockerfile paths
✓ All services use .env for configuration

## Next Steps

1. **Copy template**: `cp .env.compose.example .env.compose`
2. **Edit secrets**: `nano .env.compose` (add JWT secrets, OAuth keys, etc.)
3. **Build**: `docker compose --env-file .env.compose build`
4. **Start**: `docker compose --env-file .env.compose up -d`
5. **Verify**: `docker compose --env-file .env.compose ps` + check logs
6. **Access**: 
   - UI: http://localhost:3000
   - API: http://localhost:8888
   - RabbitMQ: http://localhost:15672 (admin/admin)

## Troubleshooting

Xem chi tiết ở `DOCKER.md` → Troubleshooting section.

Common issues:
- "port already in use" → kiểm tra `lsof -i :port`
- "can't connect to database" → check `docker compose --env-file .env.compose logs postgres`
- "RabbitMQ connection refused" → check `docker compose --env-file .env.compose logs rabbitmq`
- Services can't communicate → verify network `docker network inspect app-network`
