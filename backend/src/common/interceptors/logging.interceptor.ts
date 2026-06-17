import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request & { requestId?: string; user?: { userId: string } }>();
    const response = ctx.getResponse<Response>();

    const requestId = randomUUID();
    request.requestId = requestId;
    response.setHeader('X-Request-ID', requestId);

    const { method, url } = request;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - start;
          this.logger.log(
            `${method} ${url} ${response.statusCode} ${duration}ms`,
            { requestId, userId: request.user?.userId },
          );
        },
        error: (err: Error) => {
          const duration = Date.now() - start;
          this.logger.error(
            `${method} ${url} ERROR ${duration}ms — ${err.message}`,
            { requestId, userId: request.user?.userId },
          );
        },
      }),
    );
  }
}
