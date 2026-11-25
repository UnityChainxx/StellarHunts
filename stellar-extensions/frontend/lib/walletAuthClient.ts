/**
 * Wallet authentication API client for the StellarHunts wallet challenge
 * flow (`backend/src/wallet/`).
 *
 * The backend issues a single-use, time-limited challenge bound to the wallet
 * address; the wallet signs the exact message bytes and the server verifies
 * the ed25519 signature before returning a session token.
 */

import type {
  StoredWalletAuthSession,
  VerifyWalletSignatureRequest,
  WalletChallengeResponse,
  WalletSessionInfo,
  WalletSessionResponse,
} from '../types/wallet-auth';

export const WALLET_AUTH_STORAGE_KEY = 'stellar-extensions.wallet-auth.session';

export interface WalletAuthApiOptions {
  /** Base URL of the backend API. Defaults to same-origin (`''`). */
  apiBaseUrl?: string;
  /** Injectable fetch implementation (tests, auth-aware clients). */
  fetcher?: typeof fetch;
}

const resolveFetcher = (fetcher?: typeof fetch): typeof fetch =>
  fetcher ??
  (((input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, init)) as typeof fetch);

const buildUrl = (apiBaseUrl: string, path: string): string =>
  `${apiBaseUrl.replace(/\/+$/, '')}${path}`;

async function request<T>(
  options: Required<Pick<WalletAuthApiOptions, 'apiBaseUrl'>> &
    WalletAuthApiOptions & { path: string; init?: RequestInit },
): Promise<T> {
  const doFetch = resolveFetcher(options.fetcher);
  const response = await doFetch(buildUrl(options.apiBaseUrl, options.path), {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    ...options.init,
  });

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body?.message ?? '';
    } catch {
      // Non-JSON error body — fall through to the status-only message.
    }
    const suffix = Array.isArray(detail) ? detail.join(', ') : detail;
    throw new WalletAuthApiError(
      response.status,
      suffix || `Wallet auth request failed (${response.status})`,
    );
  }

  return response.json() as Promise<T>;
}

/** HTTP error carrying the backend status code for caller classification. */
export class WalletAuthApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'WalletAuthApiError';
  }
}

/** `POST /wallet/challenge` — request a signable challenge for `walletAddress`. */
export async function requestWalletChallenge(
  walletAddress: string,
  options: WalletAuthApiOptions = {},
): Promise<WalletChallengeResponse> {
  const apiBaseUrl = options.apiBaseUrl ?? '';
  return request<WalletChallengeResponse>({
    ...options,
    apiBaseUrl,
    path: '/wallet/challenge',
    init: {
      method: 'POST',
      body: JSON.stringify({ walletAddress }),
    },
  });
}

/** `POST /wallet/verify` — submit the signed challenge and receive a session. */
export async function verifyWalletChallenge(
  payload: VerifyWalletSignatureRequest,
  options: WalletAuthApiOptions = {},
): Promise<WalletSessionResponse> {
  const apiBaseUrl = options.apiBaseUrl ?? '';
  return request<WalletSessionResponse>({
    ...options,
    apiBaseUrl,
    path: '/wallet/verify',
    init: {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  });
}

/** `GET /wallet/session` — validate a stored session token server-side. */
export async function fetchWalletSession(
  accessToken: string,
  options: WalletAuthApiOptions = {},
): Promise<WalletSessionInfo> {
  const apiBaseUrl = options.apiBaseUrl ?? '';
  return request<WalletSessionInfo>({
    ...options,
    apiBaseUrl,
    path: '/wallet/session',
    init: {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

/** `POST /wallet/logout` — revoke the current wallet session server-side. */
export async function logoutWalletSession(
  accessToken: string,
  options: WalletAuthApiOptions = {},
): Promise<void> {
  const apiBaseUrl = options.apiBaseUrl ?? '';
  await request<{ revoked: boolean }>({
    ...options,
    apiBaseUrl,
    path: '/wallet/logout',
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({}),
    },
  });
}

// ── session persistence ──────────────────────────────────────────────────────

export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const defaultStorage = (): SessionStorageLike | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/** Persist a verified session. Returns false when storage is unavailable. */
export function storeAuthSession(
  session: StoredWalletAuthSession,
  storage?: SessionStorageLike | null,
  key: string = WALLET_AUTH_STORAGE_KEY,
): boolean {
  const store = storage === undefined ? defaultStorage() : storage;
  if (!store) return false;
  try {
    store.setItem(key, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

/** Read a stored session, or null when absent/corrupt. */
export function loadAuthSession(
  storage?: SessionStorageLike | null,
  key: string = WALLET_AUTH_STORAGE_KEY,
): StoredWalletAuthSession | null {
  const store = storage === undefined ? defaultStorage() : storage;
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredWalletAuthSession;
    if (
      typeof parsed?.walletAddress !== 'string' ||
      typeof parsed?.accessToken !== 'string' ||
      typeof parsed?.expiresAt !== 'number'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearAuthSession(
  storage?: SessionStorageLike | null,
  key: string = WALLET_AUTH_STORAGE_KEY,
): void {
  const store = storage === undefined ? defaultStorage() : storage;
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    // Storage may be unavailable (private mode); nothing to clear.
  }
}

/** Build the stored-session record from a verify response. */
export function sessionFromVerifyResponse(
  response: WalletSessionResponse,
): StoredWalletAuthSession {
  return {
    walletAddress: response.walletAddress,
    accessToken: response.accessToken,
    tokenType: response.tokenType,
    expiresAt: Date.now() + response.expiresIn * 1000,
    linked: response.linked,
    user: response.user ?? null,
  };
}
