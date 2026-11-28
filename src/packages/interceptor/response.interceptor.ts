import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { map, Observable } from 'rxjs';
import { API_RESPONSE_KEY } from '../decorators';
import { type ApiResponseInterface, type ApiResponseOptions } from '../interfaces';
import { DEFAULT_LANGUAGE, type RequestWithLanguage } from '@packages/guards/language.guard';
import { SUCCESS_TRANSLATIONS, translateMessage } from '../../data/i18n';
import { getRequestContext } from '@packages/context/request-context';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponseInterface<T>> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponseInterface<T>> {
    const http = context.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<RequestWithLanguage>();
    const lang = request.language ?? DEFAULT_LANGUAGE;
    const rawMessage =
      this.reflector.getAllAndOverride<ApiResponseOptions>(API_RESPONSE_KEY, [
        context.getHandler(),
        context.getClass(),
      ])?.message ?? 'SUCCESS';
    const message = translateMessage(SUCCESS_TRANSLATIONS, rawMessage, lang);

    return next.handle().pipe(
      map((data): ApiResponseInterface<T> => {
        return {
          statusCode: response.statusCode ?? 200,
          message,
          data,
          timestamp: new Date(),
          method: request.method,
          path: request.url.split('?')[0],
          correlationId: getRequestContext()?.correlationId,
        };
      }),
    );
  }
}
