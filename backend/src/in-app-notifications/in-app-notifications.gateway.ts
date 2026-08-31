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
import type { InAppNotificationsService } from './in-app-notifications.service'
import { CreateNotificationDto } from './dto/create-notification.dto'
import { SystemNotificationDto } from './dto/system-notification.dto'
import type { InAppNotification } from './entities/in-app-notification.entity'
import { WsRateLimitGuard } from '../common/guards/ws-rate-limit.guard'
import { WsRateLimit } from '../common/decorators/ws-rate-limit.decorator'

/** Maximum allowed JSON payload size for a single WebSocket message (bytes) */
const MAX_PAYLOAD_BYTES = 8_192

@WebSocketGateway({
  namespace: '/notifications',
  cors: { origin: '*' },
})
@UseGuards(WsRateLimitGuard)
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server

  private readonly logger = new Logger(NotificationsGateway.name)

  /** Track which rooms (userId channels) are occupied for broadcast */
  private readonly userRooms = new Map<string, Set<string>>()

  constructor(private readonly notificationsService: InAppNotificationsService) {}

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected to notifications: ${client.id}`)
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected from notifications: ${client.id}`)
    // Clean up room membership
    const rooms = client.rooms
    for (const room of rooms) {
      if (room === client.id) continue // skip the default room
      const members = this.userRooms.get(room)
      if (members) {
        members.delete(client.id)
        if (members.size === 0) this.userRooms.delete(room)
      }
    }
  }

  /**
   * Client requests to join their personal notification channel.
   */
  @WsRateLimit({ limit: 5, windowMs: 60_000 })
  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string },
  ): Promise<{ event: string; data: { success: boolean } | { error: string } }> {
    if (!data?.userId) {
      return { event: 'subscribeError', data: { error: 'userId is required' } }
    }

    const room = `user_${data.userId}`
    await client.join(room)

    if (!this.userRooms.has(room)) {
      this.userRooms.set(room, new Set())
    }
    this.userRooms.get(room).add(client.id)

    this.logger.log(`Client ${client.id} subscribed to ${room}`)
    return { event: 'subscribed', data: { success: true } }
  }

  /**
   * Client sends a notification to a specific user (admin/system use).
   */
  @WsRateLimit({ limit: 10, windowMs: 60_000 })
  @SubscribeMessage('sendNotification')
  async handleSendNotification(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: CreateNotificationDto,
  ): Promise<{ event: string; data: InAppNotification | { error: string } }> {
    const validationError = this.validateNotificationPayload(data)
    if (validationError) {
      return { event: 'sendError', data: { error: validationError } }
    }

    try {
      const notification =
        await this.notificationsService.createNotification(data)

      // Push to the target user's room (if they're connected)
      if (data.userId) {
        this.server
          .to(`user_${data.userId}`)
          .emit('notification', notification)
      }

      return { event: 'sendSuccess', data: notification }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to send notification'
      return { event: 'sendError', data: { error: message } }
    }
  }

  /**
   * Client sends a system-wide notification broadcast.
   */
  @WsRateLimit({ limit: 3, windowMs: 60_000 })
  @SubscribeMessage('broadcastNotification')
  async handleBroadcastNotification(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SystemNotificationDto,
  ): Promise<{ event: string; data: InAppNotification[] | { error: string } }> {
    const validationError = this.validateSystemNotificationPayload(data)
    if (validationError) {
      return { event: 'broadcastError', data: { error: validationError } }
    }

    try {
      const notifications =
        await this.notificationsService.createSystemNotification(data)

      // Broadcast to all connected clients
      this.server.emit('notification', notifications[0])

      return { event: 'broadcastSuccess', data: notifications }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to broadcast notification'
      return { event: 'broadcastError', data: { error: message } }
    }
  }

  /**
   * Fetch unread count for a user.
   */
  @WsRateLimit({ limit: 30, windowMs: 60_000 })
  @SubscribeMessage('getUnreadCount')
  async handleGetUnreadCount(
    @ConnectedSocket() _client: Socket,
    @MessageBody() data: { userId: number },
  ): Promise<{ event: string; data: number | { error: string } }> {
    if (data?.userId === undefined || data?.userId === null) {
      return { event: 'unreadCountError', data: { error: 'userId is required' } }
    }

    try {
      const count = await this.notificationsService.getUnreadCount(data.userId)
      return { event: 'unreadCount', data: count }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to get unread count'
      return { event: 'unreadCountError', data: { error: message } }
    }
  }

  // ── Payload validation helpers ──────────────────────────────────────────

  private validateNotificationPayload(data: unknown): string | null {
    if (!data || typeof data !== 'object') {
      return 'Payload must be a non-null object'
    }
    const obj = data as Record<string, unknown>

    try {
      const byteLength = Buffer.byteLength(JSON.stringify(obj), 'utf-8')
      if (byteLength > MAX_PAYLOAD_BYTES) {
        return `Payload exceeds maximum size of ${MAX_PAYLOAD_BYTES} bytes`
      }
    } catch {
      return 'Payload could not be serialised'
    }

    if (!obj.title || typeof obj.title !== 'string') {
      return 'Field \'title\' is required and must be a string'
    }
    if (obj.title.length > 200) {
      return 'Notification title must be 200 characters or fewer'
    }
    if (!obj.message || typeof obj.message !== 'string') {
      return 'Field \'message\' is required and must be a string'
    }
    if (obj.message.length > 2000) {
      return 'Notification message must be 2000 characters or fewer'
    }
    if (!obj.type || typeof obj.type !== 'string') {
      return 'Field \'type\' is required and must be a string'
    }

    return null
  }

  private validateSystemNotificationPayload(data: unknown): string | null {
    if (!data || typeof data !== 'object') {
      return 'Payload must be a non-null object'
    }
    const obj = data as Record<string, unknown>

    try {
      const byteLength = Buffer.byteLength(JSON.stringify(obj), 'utf-8')
      if (byteLength > MAX_PAYLOAD_BYTES) {
        return `Payload exceeds maximum size of ${MAX_PAYLOAD_BYTES} bytes`
      }
    } catch {
      return 'Payload could not be serialised'
    }

    if (!obj.title || typeof obj.title !== 'string') {
      return 'Field \'title\' is required and must be a string'
    }
    if (obj.title.length > 200) {
      return 'Notification title must be 200 characters or fewer'
    }
    if (!obj.message || typeof obj.message !== 'string') {
      return 'Field \'message\' is required and must be a string'
    }
    if (obj.message.length > 2000) {
      return 'Notification message must be 2000 characters or fewer'
    }
    if (!obj.type || typeof obj.type !== 'string') {
      return 'Field \'type\' is required and must be a string'
    }

    return null
  }
}
