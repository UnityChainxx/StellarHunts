import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server } from 'socket.io';
import type { MatchResultDto } from './dto/match-result.dto';

/**
 * MultiplayerQueueGateway
 * ------------------------
 * Real-time matchmaking transport. When the matchmaking cron
 * (`MultiplayerQueueService.processMatchmaking`) pairs two players it emits a
 * `match_found` event so both clients can transition out of the queue
 * immediately instead of polling (#GracefulShutdown / realtime UX).
 *
 * The Socket.IO server shares the Nest HTTP server, so `app.close()` already
 * stops accepting new socket connections. We additionally implement
 * `onApplicationShutdown` to explicitly close the Socket.IO server and let
 * in-flight emits flush before the process exits.
 */
@Injectable()
@WebSocketGateway({
  // Mirror the HTTP CORS posture; tighten via env in production.
  cors: { origin: process.env.CORS_ORIGIN ?? '*', credentials: true },
  path: '/socket.io',
})
export class MultiplayerQueueGateway implements OnApplicationShutdown {
  private readonly logger = new Logger(MultiplayerQueueGateway.name);

  @WebSocketServer()
  server: Server;

  /** Notify every connected client that a match was created. */
  notifyMatchCreated(match: MatchResultDto): void {
    if (!this.server) return;
    this.server.emit('match_found', match);
  }

  onApplicationShutdown(): void {
    if (this.server) {
      this.server.close(() => {
        this.logger.log('Socket.IO server closed.');
      });
    }
  }
}
