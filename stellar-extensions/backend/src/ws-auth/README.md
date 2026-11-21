# WebSocket Connection Auth Guard

NestJS module that authenticates Socket.IO / `@nestjs/websockets` connections
with a JWT access token or an opaque session token, and keeps that authentication
valid for the lifetime of the connection. It is self-contained: enabling it does
not require changes outside `stellar-extensions/`.

## What it does

| Behaviour | Where |
| --- | --- |
| Validates a JWT (`auth.token`, `?token=` or `Authorization: Bearer`) | `WsAuthService.validateToken` |
| Validates opaque session tokens via a pluggable validator | `WsAuthModuleOptions.sessionValidator` |
| Rejects unauthenticated handshakes with `ws:auth:error` + close | `WsAuthGuard.authenticateHandshake` |
| Is a no-op for messages on an already-authenticated socket | `WsAuthGuard.canActivate` |
| Rotates the token on `ws:auth:refresh` | `WsAuthGateway.handleWsAuthRefresh` |
| Rate limits handshakes per IP (sliding window) | `WsConnectionRateLimiter` |
| Emits structured audit events | `WsAuthService.logEvent` + `WsAuditLogger` |
| Notifies and gracefully closes expired connections | `WsAuthService.expire` |

## Install

Import `src/ws-auth` into the consuming NestJS app, register the module and
apply the guard at gateway level:

```ts
// app.module.ts
import { WsAuthModule } from './ws-auth';

@Module({
  imports: [
    WsAuthModule.forRoot({
      jwtSecret: process.env.JWT_SECRET,
      jwtIssuer: 'stellar-hunts',
      // Optional: validate opaque session tokens with the session store.
      sessionValidator: async (token) => {
        const session = await sessionStore.find(token);
        if (!session) return null;
        return {
          userId: session.userId,
          expiresAt: session.expiresAt,
          walletAddress: session.walletAddress,
        };
      },
      maxConnectionAttempts: 10,
      rateLimitWindowMs: 60_000,
    }),
  ],
})
export class AppModule {}
```

```ts
// game.gateway.ts
import { UseGuards } from '@nestjs/common';
import { WebSocketGateway } from '@nestjs/websockets';
import { WsAuthGateway, WsAuthGuard, WsAuthService } from './ws-auth';

@WebSocketGateway({ namespace: 'game' })
@UseGuards(WsAuthGuard)
export class GameGateway extends WsAuthGateway {
  constructor(wsAuth: WsAuthService) {
    super(wsAuth);
  }
}
```

Because the guard is idempotent, it can stay on the gateway class: the handshake
does the token work, and every later frame hits only an in-memory session lookup.

The authenticated principal is available as `client.data.user` (a
`WsAuthIdentity`) and `client.data.wsAuth` (identity, raw token, expiry).

## Client contract

| Direction | Event | Payload |
| --- | --- | --- |
| client → server | `ws:auth:refresh` | `{ token: string }` |
| server → client | `ws:auth:refreshed` | `{ expiresAt: number }` |
| client ack | `ws:auth:refresh` | `{ ok: true, expiresAt }` / `{ ok: false, error }` |
| server → client | `ws:auth:expired` | `{ reason: 'session-expired' }` |
| server → client | `ws:auth:error` | `{ reason: 'missing-token' \| 'invalid-token' \| 'rate-limited' }` |

A rejected refresh never closes a still-valid connection; the client keeps using
the old token and can retry before `expiresAt`. A failed handshake is always
closed with a `ws:auth:error` frame emitted first.

## Configuration

| Option | Default | Description |
| --- | --- | --- |
| `jwtSecret` | — | Secret used to verify JWT access tokens |
| `jwtIssuer` / `jwtAudience` | — | Optional expected claims |
| `sessionValidator` | — | Fallback resolver for opaque session tokens |
| `maxConnectionAttempts` | `10` | Handshake attempts allowed per IP per window |
| `rateLimitWindowMs` | `60000` | Sliding-window length |
| `expiryGraceMs` | `250` | Delay between `ws:auth:expired` and the socket close |
| `auditLogger` | JSON lines on stdout | Sink for `WsAuditEvent` records |
| `now` | `Date.now` | Clock override for deterministic tests |

JWT requirements: a `sub` (or `userId`) claim and an `exp` claim. Tokens without
an expiry are rejected because expiry-driven disconnection is part of the
contract.

## Audit events

`connection.attempt`, `connection.authenticated`, `connection.rejected`,
`connection.rate_limited`, `connection.refreshed`, `connection.expired`,
`connection.closed`.

Each record carries `socketId`, `ip`, `timestamp`, and when applicable `userId`,
`reason` and `retryAfterMs`. Rate-limit keying uses `handshake.address` (falling
back to `socket.client.remoteAddress`), with IPv4-mapped IPv6 normalized so the
same host is not counted twice.

## Tests

```bash
cd stellar-extensions/backend
npx tsc --noEmit -p src/ws-auth/tsconfig.json     # module typecheck
npx jest --config jest.config.js src/ws-auth      # module unit tests
```

The module typecheck is scoped to `src/ws-auth`; the shared
`stellar-extensions/backend/tsconfig.json` also includes
`stellar-extensions/tests/`, whose referral harness currently has pre-existing
type errors unrelated to this module.

Coverage includes handshake success/failure paths, JWT claim mapping, session
token fallback, per-IP rate limiting, idempotence for post-handshake frames,
token rotation (including cross-user and post-expiry refresh), expiry timers and
gateway disconnect cleanup.

## Deployment notes

`WsConnectionRateLimiter` is per-process. When the socket tier runs more than one
replica, also enforce a shared limit (edge / gateway / Redis) so attempts cannot
be multiplied across instances. If you replace Socket.IO, the guard only needs
`handshake`, `data`, `emit` and `disconnect` on the socket, which are all part of
the `WsAuthSocket` contract.
