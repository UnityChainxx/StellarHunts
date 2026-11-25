/**
 * Types for achievement unlock events delivered over the notifications
 * WebSocket namespace (`backend/src/in-app-notifications`).
 */

/** Normalized achievement unlock event consumed by `useAchievementUnlock`. */
export interface AchievementUnlockEvent {
  /** Stable dedupe key — achievement id when known, else the event id. */
  id: string;
  /** Backend achievement identifier, when the payload carries one. */
  achievementId?: string;
  title: string;
  description?: string;
  /** Icon / image URL when provided by the backend. */
  iconUrl?: string | null;
  /** ISO timestamp of the unlock, when provided. */
  unlockedAt?: string;
  /** Owning user id when the payload is user-scoped. */
  userId?: string | number | null;
  /** Raw payload for callers that need extra fields. */
  raw?: unknown;
}

/** Socket-like surface the hook needs (socket.io client compatible). */
export interface AchievementSocket {
  on(event: string, listener: (...args: any[]) => void): unknown;
  off?(event: string, listener?: (...args: any[]) => void): unknown;
  emit?(event: string, ...args: any[]): unknown;
  connect?(): unknown;
  disconnect?(): unknown;
  connected?: boolean;
}

/** Factory producing a connected socket for the notifications namespace. */
export type AchievementSocketFactory = (options: {
  namespace: string;
  userId?: string | number | null;
  /** Backend origin hint for factories that build the socket themselves. */
  serverUrl?: string;
}) => AchievementSocket | Promise<AchievementSocket>;
