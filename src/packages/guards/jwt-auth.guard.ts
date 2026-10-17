import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '@packages/decorators';
import type { Request } from 'express';
import { getJwtTokensConfig } from '../configs/jwt-sign.config';
import type { JwtUserRole } from '@packages/helpers';
import { RmqProducer } from '../../features/rabbitmq/rmq.producer';

/**
 * Access-token payload shape. `sid` identifies the login session (one per device); tokens without
 * it (issued before sessions were introduced) are rejected so those users sign in again.
 */
export type JwtGuardUser = {
  id: string;
  email: string;
  typ: 'access';
  role: JwtUserRole;
  sid: string;
};

type RequestWithUser = Request & { user?: JwtGuardUser };

function bearerToken(authorization: string | undefined): string | undefined {
  if (!authorization || typeof authorization !== 'string') {
    return undefined;
  }
  const [scheme, value] = authorization.split(' ');
  if (scheme !== 'Bearer' || !value) {
    return undefined;
  }
  return value;
}

const JWT_ROLES: readonly JwtUserRole[] = ['STUDENT', 'ADMIN', 'TUTOR', 'PARENT'];

// Unknown or missing roles are rejected rather than silently demoted to STUDENT.
function parseJwtUserRole(value: unknown): JwtUserRole {
  if (typeof value === 'string' && (JWT_ROLES as readonly string[]).includes(value)) {
    return value as JwtUserRole;
  }
  throw new UnauthorizedException('Check role user failed ...');
}

function parseAccessPayload(decoded: unknown): JwtGuardUser {
  if (typeof decoded !== 'object' || decoded === null) {
    throw new UnauthorizedException('Unauthorized ...');
  }
  const o = decoded as Record<string, unknown>;
  if (o.typ !== 'access' || typeof o.sub !== 'string' || typeof o.email !== 'string') {
    throw new UnauthorizedException('Unauthorized ...');
  }
  // Legacy tokens without a session id cannot be revoked per session: force a fresh login.
  if (typeof o.sid !== 'string' || o.sid.length === 0) {
    throw new UnauthorizedException('Session expired or not found ...');
  }
  return {
    id: o.sub,
    email: o.email,
    typ: 'access',
    role: parseJwtUserRole(o.role),
    sid: o.sid,
  };
}

/** Redis key written by the user service on login/refresh: `session:{userId}:{sid}`. */
export function sessionRedisKey(userId: string, sid: string): string {
  return `session:${userId}:${sid}`;
}

// Only positive results are cached, briefly, so a logout/revocation takes effect quickly and a
// transient miss (or fresh login) is never pinned as "invalid".
const SESSION_CACHE_TTL_MS = 5_000;
const SESSION_CACHE_MAX_ENTRIES = 10_000;
// One short retry on an infrastructure failure (RabbitMQ/third-service hiccup) before deciding.
const SESSION_CHECK_ATTEMPTS = 2;
const SESSION_CHECK_RETRY_DELAY_MS = 100;

interface CacheEntry {
  expiresAt: number;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
  private readonly sessionCache = new Map<string, CacheEntry>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
    private readonly rmqProducer: RmqProducer,
  ) {}

  private isCachedValid(key: string): boolean {
    const entry = this.sessionCache.get(key);
    if (!entry) {
      return false;
    }
    if (Date.now() > entry.expiresAt) {
      this.sessionCache.delete(key);
      return false;
    }
    return true;
  }

  private cacheValid(key: string): void {
    if (this.sessionCache.size >= SESSION_CACHE_MAX_ENTRIES) {
      this.pruneSessionCache();
    }
    this.sessionCache.set(key, { expiresAt: Date.now() + SESSION_CACHE_TTL_MS });
  }

  /** Drops expired entries, then the oldest ones if the cache is still full. */
  private pruneSessionCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.sessionCache) {
      if (entry.expiresAt <= now) this.sessionCache.delete(key);
    }
    for (const key of this.sessionCache.keys()) {
      if (this.sessionCache.size < SESSION_CACHE_MAX_ENTRIES) break;
      this.sessionCache.delete(key);
    }
  }

  private failOpenOnSessionStoreError(): boolean {
    return this.configService.get<string>('SESSION_CHECK_FAIL_OPEN') === 'true';
  }

  /**
   * Asks third-service whether `session:{userId}:{sid}` still exists. Fail closed by default: an
   * infrastructure error means the request is refused (503), so a revoked session cannot slip through
   * during an outage. `SESSION_CHECK_FAIL_OPEN=true` restores the availability-first behaviour.
   */
  private async sessionExists(userId: string, sid: string): Promise<boolean> {
    const key = sessionRedisKey(userId, sid);
    let lastError: unknown;
    for (let attempt = 1; attempt <= SESSION_CHECK_ATTEMPTS; attempt++) {
      try {
        const result = await this.rmqProducer.send<boolean, { key: string }>('redis.exists', {
          key,
        });
        return Boolean(result);
      } catch (error) {
        lastError = error;
        if (attempt < SESSION_CHECK_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, SESSION_CHECK_RETRY_DELAY_MS));
        }
      }
    }
    if (this.failOpenOnSessionStoreError()) {
      this.logger.warn(`Session check failed for user ${userId}, failing open (env): ${String(lastError)}`);
      return true;
    }
    this.logger.error(`Session check failed for user ${userId}, failing closed: ${String(lastError)}`);
    throw new ServiceUnavailableException('Session store unavailable, please retry');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = bearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException('Unauthorized ...');
    }

    const { accessSecret } = getJwtTokensConfig(this.configService);

    let decoded: unknown;
    try {
      decoded = this.jwtService.verify(token, {
        secret: accessSecret,
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Unauthorized ...');
    }

    const payload = parseAccessPayload(decoded);
    request.user = payload;

    // Every authenticated request must map to a live session (`session:{sub}:{sid}`). Negative results
    // are never cached, so a revoked session is rejected on the next request.
    const cacheKey = `${payload.id}:${payload.sid}`;
    if (this.isCachedValid(cacheKey)) {
      return true;
    }

    const exists = await this.sessionExists(payload.id, payload.sid);
    if (!exists) {
      this.sessionCache.delete(cacheKey);
      throw new UnauthorizedException('Session expired or not found ...');
    }
    this.cacheValid(cacheKey);
    return true;
  }
}
