import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
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

/** Access-token payload shape (matches access JWTs from `signAccessToken`). */
export type JwtGuardUser = {
  id: string;
  email: string;
  typ: 'access';
  role: JwtUserRole;
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

function parseJwtUserRole(value: unknown): JwtUserRole {
  if (typeof value != 'string') throw new UnauthorizedException('Check role user failed ...');
  if (typeof value === 'string' && (JWT_ROLES as readonly string[]).includes(value)) {
    return value as JwtUserRole;
  }
  return 'STUDENT';
}

function parseAccessPayload(decoded: unknown): JwtGuardUser {
  if (typeof decoded !== 'object' || decoded === null) {
    throw new UnauthorizedException('Unauthorized ...');
  }
  const o = decoded as Record<string, unknown>;
  if (o.typ !== 'access' || typeof o.sub !== 'string' || typeof o.email !== 'string') {
    throw new UnauthorizedException('Unauthorized ...');
  }
  return { id: o.sub, email: o.email, typ: 'access', role: parseJwtUserRole(o.role) };
}

const SESSION_KEY_PREFIX = 'session:';
// Only positive results are cached, briefly, so a logout/revocation takes effect quickly and a
// transient miss (or fresh login) is never pinned as "invalid".
const SESSION_CACHE_TTL_MS = 5_000;
const SESSION_CACHE_MAX_ENTRIES = 10_000;

interface CacheEntry {
  valid: boolean;
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

  private getCachedSession(userId: string): CacheEntry | undefined {
    const entry = this.sessionCache.get(userId);
    if (!entry || Date.now() > entry.expiresAt) {
      this.sessionCache.delete(userId);
      return undefined;
    }
    return entry;
  }

  private setCachedSession(userId: string, valid: boolean): void {
    if (this.sessionCache.size >= SESSION_CACHE_MAX_ENTRIES) {
      this.pruneSessionCache();
    }
    this.sessionCache.set(userId, { valid, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });
  }

  /** Drops expired entries, then the oldest ones if the cache is still full. */
  private pruneSessionCache(): void {
    const now = Date.now();
    for (const [userId, entry] of this.sessionCache) {
      if (entry.expiresAt <= now) this.sessionCache.delete(userId);
    }
    for (const userId of this.sessionCache.keys()) {
      if (this.sessionCache.size < SESSION_CACHE_MAX_ENTRIES) break;
      this.sessionCache.delete(userId);
    }
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
      });
    } catch {
      throw new UnauthorizedException('Unauthorized ...');
    }

    const payload = parseAccessPayload(decoded);
    request.user = payload;

    // Verify the user has an active session in Redis via third-service over RabbitMQ.
    // A missing session means the user logged out or the session expired.
    // Fail open: if RabbitMQ/Redis is unreachable, let the request through (availability > security
    // for infrastructure failures). Only block when Redis explicitly reports the session key is gone (exists=false).
    // In-memory cache avoids a RabbitMQ round-trip on every request from the same user.
    // Negative results are never cached: a missing session is re-checked (and rejected) on every
    // request, so a revoked session cannot pass on a stale entry.
    const cached = this.getCachedSession(payload.id);
    if (cached?.valid) {
      return true;
    }

    try {
      const sessionExists = await this.rmqProducer.send<boolean, { key: string }>('redis.exists', {
        key: `${SESSION_KEY_PREFIX}${payload.id}`,
      });
      if (!sessionExists) {
        this.sessionCache.delete(payload.id);
        throw new UnauthorizedException('Session expired or not found ...');
      }
      this.setCachedSession(payload.id, true);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      // Infrastructure failure (RabbitMQ down, third_service unreachable, etc.) — fail open
      this.logger.warn(`Redis session check failed for user ${payload.id}, failing open: ${error}`);
    }

    return true;
  }
}
