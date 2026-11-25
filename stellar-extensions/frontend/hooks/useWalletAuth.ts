'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearAuthSession,
  fetchWalletSession,
  loadAuthSession,
  logoutWalletSession,
  requestWalletChallenge,
  sessionFromVerifyResponse,
  storeAuthSession,
  verifyWalletChallenge,
  WalletAuthApiError,
  type SessionStorageLike,
  type WalletAuthApiOptions,
} from '../lib/walletAuthClient';
import { createFreighterWalletAdapter } from '../lib/defaultWalletAdapter';
import type {
  StoredWalletAuthSession,
  WalletAuthAdapter,
  WalletAuthError,
  WalletAuthStatus,
  WalletSessionResponse,
} from '../types/wallet-auth';

export interface UseWalletAuthOptions extends WalletAuthApiOptions {
  /**
   * Wallet adapter used for connect/sign. Defaults to the Freighter adapter;
   * inject a custom one for WalletConnect or test environments.
   */
  wallet?: WalletAuthAdapter;
  /** Storage backend for the persisted session (defaults to localStorage). */
  storage?: SessionStorageLike | null;
  /** localStorage key for the session record. */
  storageKey?: string;
  /**
   * When true (default), a stored session is re-validated against
   * `GET /wallet/session` on mount and the user is restored automatically.
   */
  autoConnect?: boolean;
}

export interface UseWalletAuthResult {
  status: WalletAuthStatus;
  /** True once the full challenge/sign/verify flow has completed. */
  isAuthenticated: boolean;
  session: StoredWalletAuthSession | null;
  walletAddress: string | null;
  /** Linked account user when the wallet maps to a full account. */
  user: StoredWalletAuthSession['user'];
  error: WalletAuthError | null;
  /**
   * Run the full flow: connect wallet -> request challenge -> sign message ->
   * verify with backend -> persist session. Resolves with the session or null.
   */
  authenticate: () => Promise<StoredWalletAuthSession | null>;
  /** Alias of `authenticate` matching the issue's "connect" wording. */
  connect: () => Promise<StoredWalletAuthSession | null>;
  /** Revoke the server-side session and clear local state. */
  logout: () => Promise<void>;
  /** Drop local state only (no server call). */
  disconnect: () => void;
  /** Manually re-validate the stored session against the backend. */
  refreshSession: () => Promise<boolean>;
}

const toAuthError = (error: unknown): WalletAuthError => {
  if (error instanceof WalletAuthApiError) {
    if (error.status === 401) {
      return { code: 'verification-failed', message: error.message };
    }
    return { code: 'network', message: error.message };
  }
  const e = error as { code?: string; name?: string; message?: string } | null;
  if (e?.code === 'wallet-not-installed' || e?.name === 'WalletNotInstalledError') {
    return { code: 'wallet-not-installed', message: e.message ?? 'Wallet not installed' };
  }
  if (e?.name === 'WalletConnectionRejected' || /reject|cancel/i.test(e?.message ?? '')) {
    return { code: 'connection-rejected', message: e?.message ?? 'Wallet connection was rejected.' };
  }
  if (/sign/i.test(e?.message ?? '') && e?.name !== 'WalletAuthApiError') {
    return { code: 'signature-rejected', message: e?.message ?? 'Signature was rejected.' };
  }
  return { code: 'unknown', message: e?.message ?? 'Wallet authentication failed.' };
};

/**
 * `useWalletAuth` manages the complete Stellar wallet authentication flow:
 *
 *   1. connect     — obtain the wallet address (Freighter by default)
 *   2. challenge   — `POST /wallet/challenge` issues a single-use nonce+message
 *   3. sign        — the wallet signs the exact challenge message bytes
 *   4. verify      — `POST /wallet/verify` returns a session token
 *   5. session     — token + metadata persisted to storage
 *
 * On mount it auto-connects when a non-expired session exists and revalidates
 * it against `GET /wallet/session`. Expired/revoked sessions are cleared.
 */
export function useWalletAuth(options: UseWalletAuthOptions = {}): UseWalletAuthResult {
  const {
    wallet,
    storage,
    storageKey,
    autoConnect = true,
    apiBaseUrl = '',
    fetcher,
  } = options;

  const [status, setStatus] = useState<WalletAuthStatus>('idle');
  const [session, setSession] = useState<StoredWalletAuthSession | null>(null);
  const [error, setError] = useState<WalletAuthError | null>(null);

  const walletRef = useRef<WalletAuthAdapter | null>(null);
  const mountedRef = useRef(true);
  const authenticatingRef = useRef(false);

  const getWallet = useCallback((): WalletAuthAdapter => {
    if (!walletRef.current) {
      walletRef.current = wallet ?? createFreighterWalletAdapter();
    }
    return walletRef.current;
  }, [wallet]);

  const apiOptions = useCallback(
    (): WalletAuthApiOptions => ({ apiBaseUrl, fetcher }),
    [apiBaseUrl, fetcher],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applySession = useCallback(
    (next: StoredWalletAuthSession | null) => {
      setSession(next);
      setStatus(next ? 'authenticated' : 'idle');
      setError(null);
    },
    [],
  );

  const clearLocal = useCallback(() => {
    clearAuthSession(storage, storageKey);
    applySession(null);
  }, [storage, storageKey, applySession]);

  /**
   * Validate the persisted session against `GET /wallet/session`.
   * Returns true when the session is still accepted by the backend.
   */
  const refreshSession = useCallback(async (): Promise<boolean> => {
    const stored = loadAuthSession(storage, storageKey);
    if (!stored) {
      applySession(null);
      return false;
    }
    if (stored.expiresAt <= Date.now()) {
      clearLocal();
      setError({ code: 'session-expired', message: 'Stored session has expired.' });
      setStatus('error');
      return false;
    }

    try {
      const info = await fetchWalletSession(stored.accessToken, apiOptions());
      if (!mountedRef.current) return false;
      const refreshed: StoredWalletAuthSession = {
        ...stored,
        walletAddress: info.walletAddress ?? stored.walletAddress,
        linked: info.linked ?? stored.linked,
        user: info.user ?? stored.user,
      };
      storeAuthSession(refreshed, storage, storageKey);
      applySession(refreshed);
      return true;
    } catch (err) {
      if (!mountedRef.current) return false;
      // 401/403 mean the token was revoked or expired server-side.
      if (err instanceof WalletAuthApiError && (err.status === 401 || err.status === 403)) {
        clearLocal();
        return false;
      }
      // Network failures keep the local session; the next call will retry.
      applySession(stored);
      return true;
    }
  }, [storage, storageKey, apiOptions, applySession, clearLocal]);

  // Auto-connect on mount when a session exists.
  useEffect(() => {
    if (!autoConnect) return;
    const stored = loadAuthSession(storage, storageKey);
    if (!stored) return;
    if (stored.expiresAt <= Date.now()) {
      clearAuthSession(storage, storageKey);
      return;
    }
    void refreshSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const authenticate = useCallback(async (): Promise<StoredWalletAuthSession | null> => {
    if (authenticatingRef.current) return session;
    authenticatingRef.current = true;

    try {
      // ── 1. connect ──────────────────────────────────────────────────────
      setStatus('connecting');
      setError(null);
      const adapter = getWallet();
      const address = await adapter.connect();
      if (!mountedRef.current) return null;
      if (!address) {
        setStatus('error');
        setError({ code: 'connection-rejected', message: 'Wallet connection was rejected.' });
        return null;
      }

      // ── 2. challenge ────────────────────────────────────────────────────
      setStatus('signing');
      const challenge = await requestWalletChallenge(address, apiOptions());
      if (!mountedRef.current) return null;

      // ── 3. sign ─────────────────────────────────────────────────────────
      const signature = await adapter.signMessage(challenge.message, address);
      if (!mountedRef.current) return null;
      if (!signature) {
        setStatus('error');
        setError({ code: 'signature-rejected', message: 'Wallet returned no signature.' });
        return null;
      }

      // ── 4. verify ───────────────────────────────────────────────────────
      setStatus('verifying');
      const response: WalletSessionResponse = await verifyWalletChallenge(
        { walletAddress: address, nonce: challenge.nonce, signature },
        apiOptions(),
      );
      if (!mountedRef.current) return null;

      // ── 5. persist session ─────────────────────────────────────────────
      const next = sessionFromVerifyResponse(response);
      storeAuthSession(next, storage, storageKey);
      applySession(next);
      return next;
    } catch (err) {
      if (!mountedRef.current) return null;
      const authError = toAuthError(err);
      setError(authError);
      setStatus('error');
      return null;
    } finally {
      authenticatingRef.current = false;
    }
  }, [session, getWallet, apiOptions, storage, storageKey, applySession]);

  const logout = useCallback(async () => {
    const current = session ?? loadAuthSession(storage, storageKey);
    if (current?.accessToken) {
      try {
        await logoutWalletSession(current.accessToken, apiOptions());
      } catch {
        // Revocation is best-effort; local state is cleared regardless.
      }
    }
    try {
      await getWallet().disconnect?.();
    } catch {
      // ignore
    }
    clearLocal();
  }, [session, storage, storageKey, apiOptions, getWallet, clearLocal]);

  const disconnect = useCallback(() => {
    try {
      getWallet().disconnect?.();
    } catch {
      // ignore
    }
    clearLocal();
  }, [getWallet, clearLocal]);

  return {
    status,
    isAuthenticated: status === 'authenticated' && session !== null,
    session,
    walletAddress: session?.walletAddress ?? null,
    user: session?.user ?? null,
    error,
    authenticate,
    connect: authenticate,
    logout,
    disconnect,
    refreshSession,
  };
}

export default useWalletAuth;
