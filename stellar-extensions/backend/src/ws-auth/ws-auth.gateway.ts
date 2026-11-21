import { Injectable } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  type OnGatewayDisconnect,
} from '@nestjs/websockets';
import { WS_AUTH_REFRESH_EVENT } from './ws-auth.constants';
import { WsAuthService } from './ws-auth.service';
import type {
  WsAuthRefreshAck,
  WsAuthRefreshPayload,
  WsAuthSocket,
} from './ws-auth.types';

/**
 * Base class for gateways that use `WsAuthGuard`.
 *
 * Extending it wires the two lifecycle concerns that a guard cannot own:
 * - `ws:auth:refresh` rotates the token of a live connection;
 * - disconnects remove the socket from the session registry.
 *
 * ```ts
 * @WebSocketGateway({ namespace: 'game' })
 * @UseGuards(WsAuthGuard)
 * export class GameGateway extends WsAuthGateway {
 *   constructor(wsAuth: WsAuthService) {
 *     super(wsAuth);
 *   }
 * }
 * ```
 */
@Injectable()
export abstract class WsAuthGateway implements OnGatewayDisconnect {
  protected constructor(protected readonly wsAuth: WsAuthService) {}

  @SubscribeMessage(WS_AUTH_REFRESH_EVENT)
  async handleWsAuthRefresh(
    @ConnectedSocket() client: WsAuthSocket,
    @MessageBody() payload: WsAuthRefreshPayload,
  ): Promise<WsAuthRefreshAck> {
    if (!payload?.token) {
      return { ok: false, error: 'missing-token' };
    }

    try {
      const identity = await this.wsAuth.refresh(client, payload.token);
      return { ok: true, expiresAt: identity.expiresAt };
    } catch {
      // A failed refresh must not kill the still-valid connection; the client
      // can retry before the current token expires.
      this.wsAuth.logEvent('connection.rejected', client, {
        reason: 'refresh-rejected',
      });
      return { ok: false, error: 'refresh-rejected' };
    }
  }

  handleDisconnect(client: WsAuthSocket): void {
    this.wsAuth.unregister(client);
  }
}
