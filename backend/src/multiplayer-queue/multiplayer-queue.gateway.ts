import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets'
import { Logger, UseGuards } from '@nestjs/common'
import { Server, Socket } from 'socket.io'
import type { MultiplayerQueueService } from './multiplayer-queue.service'
import type { JoinQueueDto } from './dto/join-queue.dto'
import { QueueStatusDto } from './dto/queue-status.dto'
import { WsRateLimitGuard } from '../common/guards/ws-rate-limit.guard'
import { WsRateLimit } from '../common/decorators/ws-rate-limit.decorator'

/** Maximum allowed JSON payload size for a single WebSocket message (bytes) */
const MAX_PAYLOAD_BYTES = 8_192

@WebSocketGateway({
  namespace: '/multiplayer',
  cors: { origin: '*' },
})
@UseGuards(WsRateLimitGuard)
export class MultiplayerGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server

  private readonly logger = new Logger(MultiplayerGateway.name)

  constructor(private readonly queueService: MultiplayerQueueService) {}

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected to multiplayer: ${client.id}`)
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected from multiplayer: ${client.id}`)
  }

  /**
   * Handle a player joining the matchmaking queue.
   */
  @WsRateLimit({ limit: 5, windowMs: 60_000 })
  @SubscribeMessage('joinQueue')
  async handleJoinQueue(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: JoinQueueDto,
  ): Promise<{ event: string; data: QueueStatusDto | { error: string } }> {
    const validationError = this.validatePayload(data, {
      requiredFields: ['userId', 'username', 'skillLevel'],
      maxStringLengths: { username: 100, gameMode: 50 },
      maxArraySizes: { preferredOpponents: 10, avoidOpponents: 10 },
    })
    if (validationError) {
      return { event: 'joinQueueError', data: { error: validationError } }
    }

    try {
      const status = await this.queueService.joinQueue(data)
      return { event: 'joinQueueSuccess', data: status }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to join queue'
      return { event: 'joinQueueError', data: { error: message } }
    }
  }

  /**
   * Handle a player leaving the matchmaking queue.
   */
  @WsRateLimit({ limit: 10, windowMs: 60_000 })
  @SubscribeMessage('leaveQueue')
  async handleLeaveQueue(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string },
  ): Promise<{ event: string; data: { success: boolean } | { error: string } }> {
    if (!data?.userId) {
      return { event: 'leaveQueueError', data: { error: 'userId is required' } }
    }

    try {
      await this.queueService.leaveQueue(data.userId)
      return { event: 'leaveQueueSuccess', data: { success: true } }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to leave queue'
      return { event: 'leaveQueueError', data: { error: message } }
    }
  }

  /**
   * Allow clients to subscribe to queue status updates.
   */
  @WsRateLimit({ limit: 30, windowMs: 60_000 })
  @SubscribeMessage('getQueueStatus')
  async handleGetStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string },
  ): Promise<{ event: string; data: QueueStatusDto | null | { error: string } }> {
    if (!data?.userId) {
      return { event: 'queueStatusError', data: { error: 'userId is required' } }
    }

    try {
      const status = await this.queueService.getQueueStatus(data.userId)
      return { event: 'queueStatus', data: status }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to get status'
      return { event: 'queueStatusError', data: { error: message } }
    }
  }

  // ── Payload validation helpers ──────────────────────────────────────────

  private validatePayload(
    data: unknown,
    rules: {
      requiredFields?: string[]
      maxStringLengths?: Record<string, number>
      maxArraySizes?: Record<string, number>
    },
  ): string | null {
    if (!data || typeof data !== 'object') {
      return 'Payload must be a non-null object'
    }

    const obj = data as Record<string, unknown>

    // Check raw size (defensive — JSON.stringify on the parsed object)
    try {
      const byteLength = Buffer.byteLength(JSON.stringify(obj), 'utf-8')
      if (byteLength > MAX_PAYLOAD_BYTES) {
        return `Payload exceeds maximum size of ${MAX_PAYLOAD_BYTES} bytes`
      }
    } catch {
      return 'Payload could not be serialised'
    }

    // Required fields
    if (rules.requiredFields) {
      for (const field of rules.requiredFields) {
        if (obj[field] === undefined || obj[field] === null) {
          return `Missing required field: ${field}`
        }
      }
    }

    // String length limits
    if (rules.maxStringLengths) {
      for (const [field, maxLen] of Object.entries(rules.maxStringLengths)) {
        const val = obj[field]
        if (typeof val === 'string' && val.length > maxLen) {
          return `Field '${field}' must be ${maxLen} characters or fewer`
        }
      }
    }

    // Array size limits
    if (rules.maxArraySizes) {
      for (const [field, maxLen] of Object.entries(rules.maxArraySizes)) {
        const val = obj[field]
        if (Array.isArray(val) && val.length > maxLen) {
          return `Field '${field}' must contain ${maxLen} or fewer entries`
        }
      }
    }

    return null
  }
}
