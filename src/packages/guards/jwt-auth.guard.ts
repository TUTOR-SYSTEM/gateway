import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '@packages/decorators';
import type { Request } from 'express';
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
const SESSION_CACHE_TTL_MS = 30_000; // 30 seconds

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
    this.sessionCache.set(userId, { valid, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });
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

    const accessSecret =
      this.configService.get<string>('JWT_ACCESS_SECRET') ??
      this.configService.get<string>('JWT_SECRET') ??
      'dev-insecure-jwt-secret';

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
    // for infrastructure failures). Only block when Redis explicitly returns null (session deleted).
    // In-memory cache avoids a RabbitMQ round-trip on every request from the same user.
    const cached = this.getCachedSession(payload.id);
    if (cached) {
      if (!cached.valid) {
        throw new UnauthorizedException('Session expired or not found ...');
      }
      return true;
    }

    try {
      const session = await this.rmqProducer.send<string | null, { key: string }>(
        'redis.get',
        { key: `${SESSION_KEY_PREFIX}${payload.id}` },
      );
      if (!session) {
        this.setCachedSession(payload.id, false);
        throw new UnauthorizedException('Session expired or not found ...');
      }
      this.setCachedSession(payload.id, true);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      // Infrastructure failure (RabbitMQ down, third_service unreachable, etc.) — fail open
      this.logger.warn(
        `Redis session check failed for user ${payload.id}, failing open: ${error}`,
      );
    }

    return true;
  }
}
