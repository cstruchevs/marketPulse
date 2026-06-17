import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { Request } from 'express';

export interface ApiResponse<T> {
  data: T;
  timestamp: string;
  requestId: string | undefined;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest<Request & { requestId?: string }>();

    return next.handle().pipe(
      map((data) => ({
        data,
        timestamp: new Date().toISOString(),
        requestId: request.requestId,
      })),
    );
  }
}
