'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  MultiplayerClientEvent,
  MultiplayerMatch,
  MultiplayerMatchResults,
  MultiplayerMatchStatus,
  MultiplayerParticipant,
  MultiplayerPuzzle,
  MultiplayerServerEvent,
  MultiplayerSocket,
} from '../types/multiplayer-match';

/** WebSocket.OPEN, without depending on the DOM lib at module scope. */
const SOCKET_OPEN = 1;

/** Relative path used when no explicit URL/socketFactory is supplied. */
export const DEFAULT_MULTIPLAYER_PATH = '/api/multiplayer/match';

export interface JoinQueueParams {
  puzzleId?: string;
  difficulty?: string;
}

export interface UseMultiplayerMatchOptions {
  /** Authenticated user joining the queue. Required before `joinQueue`. */
  userId?: string | null;
  /** Absolute or relative WebSocket URL. Defaults to `DEFAULT_MULTIPLAYER_PATH`. */
  url?: string;
  /** Injectable socket constructor, useful for tests or auth-aware clients. */
  socketFactory?: (url: string) => MultiplayerSocket;
  /** Called once with the final standings when a match completes. */
  onResults?: (results: MultiplayerMatchResults) => void;
  /** Called whenever the server (or transport) reports an error. */
  onError?: (message: string) => void;
}

export interface UseMultiplayerMatchResult {
  /** Current lifecycle state. `idle` before the player joins the queue. */
  status: MultiplayerMatchStatus;
  /** The queued/active/finished match, or null when idle or queued. */
  match: MultiplayerMatch | null;
  matchId: string | null;
  /** Players in the current match (empty while queued). */
  participants: MultiplayerParticipant[];
  /** Puzzle being played, or null while queued. */
  puzzle: MultiplayerPuzzle | null;
  /** Per-player time budget in seconds, or null while queued. */
  timeLimitSeconds: number | null;
  /** Final rankings once the match completes, otherwise null. */
  results: MultiplayerMatchResults | null;
  /** ISO timestamp of when the player entered the queue, or null. */
  queuedAt: string | null;
  error: string | null;
  isQueued: boolean;
  isMatched: boolean;
  isInProgress: boolean;
  isCompleted: boolean;
  joinQueue: (params?: JoinQueueParams) => boolean;
  leaveQueue: () => boolean;
  submitAnswer: (answer: string) => boolean;
  /** Clear the previous match/results and return to `idle`. */
  reset: () => void;
}

/**
 * Resolve the match WebSocket URL from the current origin. Kept separate so it
 * can be unit tested and reused outside React.
 */
export function resolveMultiplayerSocketUrl(path = DEFAULT_MULTIPLAYER_PATH): string {
  if (/^wss?:\/\//i.test(path)) return path;
  if (typeof window === 'undefined' || !window.location) return path;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const base = `${protocol}//${window.location.host}`;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

function openBrowserSocket(url: string): MultiplayerSocket {
  if (typeof WebSocket === 'undefined') {
    throw new Error('WebSocket is not available in this environment');
  }
  return new WebSocket(url) as unknown as MultiplayerSocket;
}

function parseServerEvent(data: unknown): MultiplayerServerEvent | null {
  if (typeof data !== 'string') return null;
  try {
    const parsed = JSON.parse(data) as MultiplayerServerEvent;
    return parsed && typeof parsed.type === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Manages a multiplayer puzzle match (issue #919): joining and leaving the
 * queue, following the match through `matched` → `in-progress` →
 * `completed`, submitting answers, and exposing the final ranked results.
 *
 * The socket is opened lazily on the first action and closed on unmount.
 */
export function useMultiplayerMatch(
  options: UseMultiplayerMatchOptions = {},
): UseMultiplayerMatchResult {
  const { userId = null, url, socketFactory, onResults, onError } = options;

  const [status, setStatus] = useState<MultiplayerMatchStatus>('idle');
  const [match, setMatch] = useState<MultiplayerMatch | null>(null);
  const [results, setResults] = useState<MultiplayerMatchResults | null>(null);
  const [queuedAt, setQueuedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<MultiplayerSocket | null>(null);
  const pendingRef = useRef<string[]>([]);
  const mountedRef = useRef(true);
  const statusRef = useRef<MultiplayerMatchStatus>('idle');
  const matchIdRef = useRef<string | null>(null);

  // Keep the latest callbacks without re-creating the socket on every render.
  const handlersRef = useRef({ onResults, onError });
  handlersRef.current = { onResults, onError };

  const setCurrentStatus = useCallback((next: MultiplayerMatchStatus) => {
    statusRef.current = next;
    if (mountedRef.current) setStatus(next);
  }, []);

  const reportError = useCallback(
    (message: string) => {
      if (!mountedRef.current) return;
      setError(message);
      handlersRef.current.onError?.(message);
    },
    [],
  );

  const handleServerEvent = useCallback(
    (event: MultiplayerServerEvent) => {
      if (!mountedRef.current) return;

      switch (event.type) {
        case 'queued': {
          setQueuedAt(event.payload.queuedAt);
          setCurrentStatus('queued');
          break;
        }

        case 'match-found': {
          const nextMatch = event.payload.match;
          matchIdRef.current = nextMatch.id;
          setMatch(nextMatch);
          setError(null);
          setCurrentStatus(
            nextMatch.status === 'in-progress' ? 'in-progress' : 'matched',
          );
          break;
        }

        case 'match-started': {
          if (matchIdRef.current && matchIdRef.current !== event.payload.matchId) {
            break;
          }
          matchIdRef.current = event.payload.matchId;
          setMatch((current) =>
            current && current.id === event.payload.matchId
              ? {
                  ...current,
                  status: 'in-progress',
                  startedAt: event.payload.startedAt,
                }
              : current,
          );
          setCurrentStatus('in-progress');
          break;
        }

        case 'match-update': {
          if (matchIdRef.current && matchIdRef.current !== event.payload.matchId) {
            break;
          }
          setMatch((current) =>
            current && current.id === event.payload.matchId
              ? { ...current, participants: event.payload.participants }
              : current,
          );
          break;
        }

        case 'answer-accepted': {
          if (matchIdRef.current && matchIdRef.current !== event.payload.matchId) {
            break;
          }
          setMatch((current) => {
            if (!current || current.id !== event.payload.matchId) return current;
            return {
              ...current,
              participants: current.participants.map((participant) =>
                participant.userId === userId
                  ? { ...participant, score: event.payload.score }
                  : participant,
              ),
            };
          });
          break;
        }

        case 'match-completed': {
          const finished = event.payload.match;
          if (finished) {
            matchIdRef.current = finished.id;
            setMatch({ ...finished, status: 'completed' });
          } else {
            setMatch((current) =>
              current
                ? {
                    ...current,
                    status: 'completed',
                    completedAt: event.payload.results.completedAt,
                  }
                : current,
            );
          }
          setResults(event.payload.results);
          setCurrentStatus('completed');
          handlersRef.current.onResults?.(event.payload.results);
          break;
        }

        case 'queue-left': {
          matchIdRef.current = null;
          setMatch(null);
          setQueuedAt(null);
          setCurrentStatus('idle');
          break;
        }

        case 'error': {
          reportError(event.payload.message);
          if (statusRef.current === 'queued') {
            setQueuedAt(null);
            setCurrentStatus('idle');
          }
          break;
        }

        default:
          break;
      }
    },
    [reportError, setCurrentStatus, userId],
  );

  const eventHandlerRef = useRef(handleServerEvent);
  eventHandlerRef.current = handleServerEvent;

  const ensureSocket = useCallback((): MultiplayerSocket => {
    const existing = socketRef.current;
    if (existing && existing.readyState !== 3) return existing; // 3 = CLOSED

    const target = url ?? resolveMultiplayerSocketUrl();
    const socket = (socketFactory ?? openBrowserSocket)(target);

    socket.onopen = () => {
      const queued = pendingRef.current;
      pendingRef.current = [];
      queued.forEach((message) => socket.send(message));
    };
    socket.onmessage = (event) => {
      const parsed = parseServerEvent(event.data);
      if (parsed) eventHandlerRef.current(parsed);
    };
    socket.onerror = () => {
      reportError('Lost connection to the multiplayer server');
    };
    socket.onclose = () => {
      socketRef.current = null;
      if (!mountedRef.current) return;
      if (statusRef.current !== 'idle' && statusRef.current !== 'completed') {
        reportError('Multiplayer connection closed');
        setCurrentStatus('idle');
      }
    };

    socketRef.current = socket;
    return socket;
  }, [reportError, setCurrentStatus, socketFactory, url]);

  const send = useCallback(
    (event: MultiplayerClientEvent): boolean => {
      let socket: MultiplayerSocket;
      try {
        socket = ensureSocket();
      } catch (err) {
        reportError(err instanceof Error ? err.message : 'Unable to connect');
        return false;
      }

      const message = JSON.stringify(event);
      if (socket.readyState === SOCKET_OPEN) {
        socket.send(message);
      } else {
        pendingRef.current.push(message);
      }
      return true;
    },
    [ensureSocket, reportError],
  );

  const joinQueue = useCallback(
    (params: JoinQueueParams = {}): boolean => {
      if (!userId) {
        reportError('A userId is required to join the multiplayer queue');
        return false;
      }
      setError(null);
      setResults(null);
      setMatch(null);
      matchIdRef.current = null;
      setQueuedAt(new Date().toISOString());
      setCurrentStatus('queued');

      const sent = send({
        type: 'join-queue',
        payload: { userId, ...params },
      });
      if (!sent) setCurrentStatus('idle');
      return sent;
    },
    [reportError, send, setCurrentStatus, userId],
  );

  const leaveQueue = useCallback((): boolean => {
    const sent = send({ type: 'leave-queue' });
    setQueuedAt(null);
    setMatch(null);
    setResults(null);
    matchIdRef.current = null;
    setCurrentStatus('idle');
    return sent;
  }, [send, setCurrentStatus]);

  const submitAnswer = useCallback(
    (answer: string): boolean => {
      const matchId = matchIdRef.current;
      if (!matchId) {
        reportError('No active match to submit an answer for');
        return false;
      }
      if (statusRef.current !== 'in-progress' && statusRef.current !== 'matched') {
        reportError('The match is not accepting answers');
        return false;
      }
      return send({
        type: 'submit-answer',
        payload: { matchId, answer },
      });
    },
    [reportError, send],
  );

  const reset = useCallback(() => {
    setMatch(null);
    setResults(null);
    setQueuedAt(null);
    setError(null);
    matchIdRef.current = null;
    setCurrentStatus('idle');
  }, [setCurrentStatus]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      pendingRef.current = [];
      const socket = socketRef.current;
      socketRef.current = null;
      try {
        socket?.close();
      } catch {
        // Closing an already-closed socket is harmless.
      }
    };
  }, []);

  const participants = useMemo(
    () => match?.participants ?? [],
    [match?.participants],
  );

  return {
    status,
    match,
    matchId: match?.id ?? null,
    participants,
    puzzle: match?.puzzle ?? null,
    timeLimitSeconds: match?.timeLimitSeconds ?? null,
    results,
    queuedAt,
    error,
    isQueued: status === 'queued',
    isMatched: status === 'matched',
    isInProgress: status === 'in-progress',
    isCompleted: status === 'completed',
    joinQueue,
    leaveQueue,
    submitAnswer,
    reset,
  };
}

export default useMultiplayerMatch;
