/**
 * Shared types for multiplayer puzzle matches (issue #919).
 *
 * The backend queue lives in `backend/src/multiplayer-queue/`; the shapes below
 * mirror the messages that module broadcasts over the match WebSocket.
 */

/** Lifecycle of a multiplayer session, from the player's point of view. */
export type MultiplayerMatchStatus =
  | 'idle'
  | 'queued'
  | 'matched'
  | 'in-progress'
  | 'completed';

/** A player taking part in a match. */
export interface MultiplayerParticipant {
  userId: string;
  username?: string;
  avatarUrl?: string;
  /** Current score for this match. 0 until the first answer is accepted. */
  score: number;
  /** 1-based finishing position, only set once the match completes. */
  rank?: number | null;
  /** ISO timestamp of the player's latest accepted answer. */
  submittedAt?: string | null;
  /** False when the player has disconnected mid-match. */
  isConnected?: boolean;
}

/** The puzzle both players are racing to solve. */
export interface MultiplayerPuzzle {
  id: string;
  title: string;
  difficulty: string;
  category?: string;
  /** Optional puzzle payload; omitted from queue summaries. */
  content?: unknown;
}

/** A single ranked row in the final standings. */
export interface MultiplayerMatchRanking {
  /** 1-based position. Ties share the better rank. */
  rank: number;
  userId: string;
  username?: string;
  score: number;
  /** True for every player sharing first place. */
  isWinner: boolean;
}

/** Final results returned once a match completes. */
export interface MultiplayerMatchResults {
  matchId: string;
  rankings: MultiplayerMatchRanking[];
  totalParticipants: number;
  /** ISO timestamp of match completion. */
  completedAt: string;
}

/** An active or finished match. */
export interface MultiplayerMatch {
  id: string;
  status: Exclude<MultiplayerMatchStatus, 'idle' | 'queued'>;
  participants: MultiplayerParticipant[];
  puzzle: MultiplayerPuzzle;
  /** Per-player time budget, in seconds. */
  timeLimitSeconds: number;
  /** ISO timestamp for when the match started, or null while waiting. */
  startedAt: string | null;
  /** ISO timestamp for when the match ended, or null while running. */
  completedAt?: string | null;
}

/** Messages the hook sends to the match server. */
export type MultiplayerClientEvent =
  | {
      type: 'join-queue';
      payload: { userId: string; puzzleId?: string; difficulty?: string };
    }
  | { type: 'leave-queue' }
  | {
      type: 'submit-answer';
      payload: { matchId: string; answer: string };
    };

/** Messages the match server sends back. */
export type MultiplayerServerEvent =
  | { type: 'queued'; payload: { queuedAt: string; position?: number } }
  | { type: 'match-found'; payload: { match: MultiplayerMatch } }
  | { type: 'match-started'; payload: { matchId: string; startedAt: string } }
  | {
      type: 'match-update';
      payload: { matchId: string; participants: MultiplayerParticipant[] };
    }
  | { type: 'answer-accepted'; payload: { matchId: string; score: number } }
  | {
      type: 'match-completed';
      payload: { results: MultiplayerMatchResults; match?: MultiplayerMatch };
    }
  | { type: 'queue-left' }
  | { type: 'error'; payload: { message: string } };

/**
 * The small slice of the WebSocket API the hook relies on. Declaring it
 * structurally keeps the hook testable with a lightweight fake and works with
 * the browser `WebSocket` unchanged.
 */
export interface MultiplayerSocket {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
}
