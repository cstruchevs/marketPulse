import {
  Controller,
  Get,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Observable, Subject } from 'rxjs';
import { map, startWith } from 'rxjs/operators';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { SseService, SseEvent } from './sse.service';

const KEEPALIVE_INTERVAL_MS = 30_000;

@ApiTags('sse')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sse')
export class SseController {
  constructor(private readonly sseService: SseService) {}

  @Get('stream')
  @ApiOperation({
    summary: 'Open SSE stream for real-time price alerts and scrape status',
  })
  stream(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): void {
    const { userId } = user;

    // SSE headers — Nginx must have proxy_buffering off for this endpoint
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // tells Nginx to disable buffering
    res.flushHeaders();

    const subject: Subject<SseEvent> = this.sseService.addClient(userId);

    // Send missed events that arrived while the client was offline
    void this.sseService.flushMissedEvents(userId, subject);

    // Keepalive ping every 30s to prevent proxy timeouts
    const keepalive = setInterval(() => {
      const ping: SseEvent = {
        type: 'ping',
        data: { ts: Date.now() },
        id: `ping-${Date.now()}`,
      };
      write(res, ping);
    }, KEEPALIVE_INTERVAL_MS);

    // Stream events to client
    const subscription = subject.subscribe({
      next: (event) => write(res, event),
      complete: () => res.end(),
    });

    // Cleanup on disconnect — MUST happen to prevent memory leak
    req.on('close', () => {
      clearInterval(keepalive);
      subscription.unsubscribe();
      this.sseService.removeClient(userId);
    });
  }
}

function write(res: Response, event: SseEvent): void {
  res.write(`id: ${event.id}\n`);
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event.data)}\n\n`);
}
