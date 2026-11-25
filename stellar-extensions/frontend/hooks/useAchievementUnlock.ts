'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AchievementSocket,
  AchievementSocketFactory,
  AchievementUnlockEvent,
} from '../types/achievement-unlock';

export interface UseAchievementUnlockOptions {
  /**
   * Already-connected socket (socket.io client or compatible EventEmitter).
   * Takes precedence over `socketFactory`.
   */
  socket?: AchievementSocket | null;
  /**
   * Factory that creates/connects a socket for the notifications namespace.
   * Defaults to a lazy `socket.io-client` import against `serverUrl`.
   */
  socketFactory?: AchievementSocketFactory;
  /** Backend origin used by the default socket factory. */
  serverUrl?: string;
  /** socket.io namespace. Defaults to `/notifications`. */
  namespace?: string;
  /**
   * User id sent in the `subscribe` message so the backend joins the user's
   * personal notification room (`user_<id>`).
   */
  userId?: string | number | null;
  /** Called for every newly unlocked achievement (in addition to state). */
  onUnlock?: (event: AchievementUnlockEvent) => void;
  /** Set to false to keep the subscription idle. */
  enabled?: boolean;
  /** Max retained unlocks in `achievements` (FIFO). Defaults to 50. */
  maxAchievements?: number;
}

export interface UseAchievementUnlockResult {
  /** Newly unlocked achievements, newest first. */
  achievements: AchievementUnlockEvent[];
  /** Most recent unlock, or null. */
  latestAchievement: AchievementUnlockEvent | null;
  isConnected: boolean;
  error: string | null;
  /** Register an unlock callback; returns an unsubscribe function. */
  onUnlock: (callback: (event: AchievementUnlockEvent) => void) => () => void;
  /** Drop the dedupe set and the retained list. */
  clear: () => void;
  /** Force a reconnect through the active socket. */
  reconnect: () => void;
}

/** Event names the backend may emit for achievement unlocks. */
const UNLOCK_EVENTS = [
  'achievementUnlocked',
  'achievement_unlocked',
  'achievement:unlock',
];

/** Fallback event carrying in-app notifications (`notification` payloads). */
const NOTIFICATION_EVENT = 'notification';

const DEFAULT_NAMESPACE = '/notifications';
const DEFAULT_MAX = 50;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Normalize a raw socket payload into an AchievementUnlockEvent, or null when
 * the payload is not an achievement unlock.
 *
 * Recognized shapes:
 *  - dedicated unlock events: `{ achievementId|id, title, ... }`
 *  - in-app notifications: `{ type: 'achievement'|'reward', title: 'Achievement unlocked!', ... }`
 */
export function normalizeAchievementUnlock(
  eventName: string,
  payload: unknown,
): AchievementUnlockEvent | null {
  if (Array.isArray(payload)) {
    // socket.io may deliver (event, data) pairs; unwrap single-element args.
    if (payload.length === 1) return normalizeAchievementUnlock(eventName, payload[0]);
    return null;
  }
  if (!isRecord(payload)) return null;

  const isDedicatedEvent = UNLOCK_EVENTS.includes(eventName);
  const type = String(payload.type ?? payload.notificationType ?? '').toLowerCase();
  const title = String(payload.title ?? '');
  const looksLikeUnlock =
    isDedicatedEvent ||
    type === 'achievement' ||
    (type === 'reward' && /achievement/i.test(title)) ||
    /achievement unlocked/i.test(title);

  if (!looksLikeUnlock) return null;

  const achievementId =
    payload.achievementId ?? payload.achievement_id ?? payload.badgeId ?? undefined;
  const id = String(
    achievementId ?? payload.id ?? payload.notificationId ?? title,
  );
  if (!id) return null;

  return {
    id,
    achievementId: achievementId !== undefined ? String(achievementId) : undefined,
    title: title || 'Achievement unlocked',
    description:
      typeof payload.description === 'string'
        ? payload.description
        : typeof payload.message === 'string'
          ? payload.message
          : undefined,
    iconUrl:
      typeof payload.iconUrl === 'string'
        ? payload.iconUrl
        : typeof payload.icon === 'string'
          ? payload.icon
          : null,
    unlockedAt:
      typeof payload.unlockedAt === 'string'
        ? payload.unlockedAt
        : typeof payload.createdAt === 'string'
          ? payload.createdAt
          : undefined,
    userId: (payload.userId ?? payload.recipientUserId ?? null) as
      | string
      | number
      | null,
    raw: payload,
  };
}

const defaultSocketFactory: AchievementSocketFactory = async ({
  namespace,
  serverUrl,
}) => {
  // `socket.io-client` is not a hard dependency of the extension frontend —
  // resolve it lazily so consumers can inject their own factory or socket.
  const moduleName = 'socket.io-client';
  const mod = (await import(/* webpackIgnore: true */ moduleName)) as {
    io?: (url: string, opts?: Record<string, unknown>) => {
      socket?: (ns: string) => AchievementSocket;
    };
    default?: unknown;
  };
  const io =
    mod.io ??
    (mod.default as
      | ((url: string, opts?: Record<string, unknown>) => {
          socket?: (ns: string) => AchievementSocket;
        })
      | undefined);
  if (typeof io !== 'function') {
    throw new Error(
      'socket.io-client is not installed. Pass `socket` or `socketFactory` to useAchievementUnlock.',
    );
  }
  const url =
    serverUrl ||
    (typeof window !== 'undefined' ? window.location.origin : '');
  const manager = io(url, { transports: ['websocket', 'polling'] });
  if (typeof manager.socket === 'function') {
    return manager.socket(namespace);
  }
  // `io(url + namespace)` also yields a namespaced socket for socket.io-client.
  return io(`${url}${namespace}`) as unknown as AchievementSocket;
};

/**
 * `useAchievementUnlock` subscribes to achievement unlock events over the
 * backend notifications WebSocket namespace.
 *
 * - emits `subscribe { userId }` on every (re)connect so the backend joins
 *   the user's room
 * - accepts dedicated `achievementUnlocked`-style events plus `notification`
 *   payloads that look like achievement unlocks
 * - dedupes by achievement id so replays / reconnects never double-report
 * - relies on socket.io auto-reconnect; `reconnect()` forces a new attempt
 */
export function useAchievementUnlock(
  options: UseAchievementUnlockOptions = {},
): UseAchievementUnlockResult {
  const {
    socket: providedSocket,
    socketFactory,
    serverUrl,
    namespace = DEFAULT_NAMESPACE,
    userId,
    onUnlock,
    enabled = true,
    maxAchievements = DEFAULT_MAX,
  } = options;

  const [achievements, setAchievements] = useState<AchievementUnlockEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<AchievementSocket | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const listenersRef = useRef<Set<(event: AchievementUnlockEvent) => void>>(new Set());
  const mountedRef = useRef(true);
  const factoryRef = useRef(socketFactory);
  factoryRef.current = socketFactory;
  const onUnlockRef = useRef(onUnlock);
  onUnlockRef.current = onUnlock;

  const emitUnlock = useCallback((event: AchievementUnlockEvent) => {
    setAchievements((prev) => {
      const next = [event, ...prev.filter((item) => item.id !== event.id)];
      return next.slice(0, maxAchievements);
    });
    listenersRef.current.forEach((listener) => {
      try {
        listener(event);
      } catch {
        // Listener errors must not break the subscription.
      }
    });
    try {
      onUnlockRef.current?.(event);
    } catch {
      // same
    }
  }, [maxAchievements]);

  const handlePayload = useCallback(
    (eventName: string) => (...args: unknown[]) => {
      // socket.io delivers (payload) or (event, payload) depending on version;
      // normalizeAchievementUnlock unwraps the shapes it understands.
      const payload =
        args.length === 1 && typeof args[0] === 'string' && UNLOCK_EVENTS.includes(args[0])
          ? args[1]
          : args[0];
      const event = normalizeAchievementUnlock(eventName, payload);
      if (!event) return;
      if (seenRef.current.has(event.id)) return;
      seenRef.current.add(event.id);
      emitUnlock(event);
    },
    [emitUnlock],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let disposed = false;
    let socket: AchievementSocket | null = providedSocket ?? null;

    const subscribeToRoom = () => {
      if (userId === undefined || userId === null) return;
      try {
        socket?.emit?.('subscribe', { userId });
      } catch {
        // subscribe is best-effort
      }
    };

    const attach = async () => {
      try {
        if (!socket) {
          const factory = factoryRef.current ?? defaultSocketFactory;
          socket = await factory({ namespace, userId, serverUrl });
        }
        if (disposed || !socket) return;
        socketRef.current = socket;

        const onConnect = () => {
          setIsConnected(true);
          setError(null);
          subscribeToRoom();
        };
        const onDisconnect = () => setIsConnected(false);
        const onConnectError = (err: unknown) => {
          setIsConnected(false);
          setError(err instanceof Error ? err.message : 'Socket connection failed');
        };

        socket.on?.('connect', onConnect);
        socket.on?.('disconnect', onDisconnect);
        socket.on?.('connect_error', onConnectError);
        for (const name of UNLOCK_EVENTS) {
          socket.on?.(name, handlePayload(name));
        }
        socket.on?.(NOTIFICATION_EVENT, handlePayload(NOTIFICATION_EVENT));

        // socket.io fires 'connect' asynchronously; seed state from the flag.
        if ((socket as { connected?: boolean }).connected) onConnect();
      } catch (err) {
        if (!disposed && mountedRef.current) {
          setError(
            err instanceof Error
              ? err.message
              : 'Achievement unlock socket is unavailable.',
          );
        }
      }
    };

    void attach();

    return () => {
      disposed = true;
      const active = socketRef.current;
      if (active && active !== providedSocket) {
        try {
          active.disconnect?.();
        } catch {
          // ignore
        }
      }
      socketRef.current = null;
      setIsConnected(false);
    };
    // Re-subscribe when the socket identity, namespace or user changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, providedSocket, namespace, userId, serverUrl, handlePayload]);

  const onUnlockCallback = useCallback(
    (callback: (event: AchievementUnlockEvent) => void) => {
      listenersRef.current.add(callback);
      return () => {
        listenersRef.current.delete(callback);
      };
    },
    [],
  );

  const clear = useCallback(() => {
    seenRef.current.clear();
    setAchievements([]);
  }, []);

  const reconnect = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    try {
      if (typeof socket.connect === 'function') {
        socket.connect();
      } else if (typeof socket.disconnect === 'function') {
        socket.disconnect();
      }
    } catch {
      // reconnect is best-effort
    }
  }, []);

  return {
    achievements,
    latestAchievement: achievements[0] ?? null,
    isConnected,
    error,
    onUnlock: onUnlockCallback,
    clear,
    reconnect,
  };
}

export default useAchievementUnlock;
