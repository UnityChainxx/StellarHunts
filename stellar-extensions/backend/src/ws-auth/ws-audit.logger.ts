import type { WsAuditEvent, WsAuditLogger } from './ws-auth.types';

/**
 * Default audit sink: one JSON object per line so existing log shippers can
 * parse connection events without extra configuration.
 */
export class ConsoleWsAuditLogger implements WsAuditLogger {
  log(event: WsAuditEvent): void {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ context: 'ws-auth', ...event }));
  }
}
