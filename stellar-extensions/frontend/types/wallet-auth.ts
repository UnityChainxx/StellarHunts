/**
 * Types for the wallet authentication flow (`hooks/useWalletAuth`).
 *
 * Mirrors the backend contract in `backend/src/wallet/`:
 *   POST /wallet/challenge -> WalletChallengeResponse
 *   POST /wallet/verify    -> WalletSessionResponse
 *   GET  /wallet/session   -> WalletSessionInfo
 *   POST /wallet/logout    -> { revoked: boolean }
 */

/** Lifecycle status reported by `useWalletAuth`. */
export type WalletAuthStatus =
  | 'idle'
  | 'connecting'
  | 'signing'
  | 'verifying'
  | 'authenticated'
  | 'error';

/** Token type returned by `POST /wallet/verify`. */
export type WalletTokenType = 'Bearer' | 'WalletSession' | string;

/** Response of `POST /wallet/challenge`. */
export interface WalletChallengeResponse {
  nonce: string;
  /** Exact UTF-8 message the wallet must sign. */
  message: string;
  expiresAt: string;
  domain: string;
}

/** Body of `POST /wallet/verify`. */
export interface VerifyWalletSignatureRequest {
  walletAddress: string;
  nonce: string;
  /** Base64-encoded ed25519 signature over the challenge message bytes. */
  signature: string;
}

/** Linked account summary returned when the wallet belongs to a user. */
export interface WalletLinkedUser {
  id: string;
  name?: string;
  username?: string;
  email?: string;
}

/** Response of `POST /wallet/verify`. */
export interface WalletSessionResponse {
  /** True when the wallet is linked to a full account (Bearer token). */
  linked: boolean;
  walletAddress: string;
  accessToken: string;
  tokenType: WalletTokenType;
  /** Lifetime of the access token, in seconds. */
  expiresIn: number;
  refreshToken?: string;
  user: WalletLinkedUser | null;
}

/** Response of `GET /wallet/session`. */
export interface WalletSessionInfo {
  walletAddress: string;
  userId: string | null;
  expiresAt: string;
  createdAt?: string;
  lastSeenAt?: string | null;
  linked?: boolean;
  user?: WalletLinkedUser | null;
}

/** Persisted auth session kept in storage between page loads. */
export interface StoredWalletAuthSession {
  walletAddress: string;
  accessToken: string;
  tokenType: WalletTokenType;
  /** Epoch milliseconds when the access token expires. */
  expiresAt: number;
  linked: boolean;
  user: WalletLinkedUser | null;
}

/** Error surfaced through `useWalletAuth().error`. */
export interface WalletAuthError {
  code:
    | 'wallet-not-installed'
    | 'connection-rejected'
    | 'challenge-failed'
    | 'signature-rejected'
    | 'verification-failed'
    | 'session-expired'
    | 'network'
    | 'unknown';
  message: string;
}

/** Injectable wallet adapter used by `useWalletAuth`. */
export interface WalletAuthAdapter {
  /**
   * Connect (or reconnect) the wallet and resolve with the account address
   * (G...). Should throw / resolve null when the user rejects or no wallet
   * is available.
   */
  connect(): Promise<string | null>;
  /**
   * Sign the exact challenge message bytes and resolve with the base64
   * ed25519 signature the backend expects.
   */
  signMessage(message: string, address: string): Promise<string>;
  /** Optional: clear any locally held wallet state. */
  disconnect?(): void | Promise<void>;
}
