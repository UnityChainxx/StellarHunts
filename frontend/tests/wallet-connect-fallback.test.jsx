/**
 * WalletConnect fallback tests for `useWalletConnection` — issue #730.
 *
 * Acceptance criteria:
 *  - QR/pairing flow → `connectWalletConnect()` exposes pairing + connects
 *  - Session persistence → a stored topic restores the session on mount
 *  - Fallback when Freighter absent → connection works without the extension
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// ── Freighter API mock: extension absent ────────────────────────────────────

vi.mock('@stellar/freighter-api', () => ({
  isConnected: vi.fn(async () => false),
  getPublicKey: vi.fn(async () => null),
  requestAccess: vi.fn(async () => {
    throw new Error('Freighter is not installed');
  }),
  getNetwork: vi.fn(async () => null),
}));

// ── WalletConnect lib mock ──────────────────────────────────────────────────

const mockStartPairing = vi.fn();
const mockFinalize = vi.fn();
const mockRestore = vi.fn();
const mockDisconnect = vi.fn();

vi.mock('@/lib/walletconnect', () => ({
  WC_PROJECT_ID: 'test-project',
  isWalletConnectConfigured: vi.fn(() =>
    Boolean(process.env.NEXT_PUBLIC_WC_PROJECT_ID)
  ),
  startWalletConnectPairing: (...args) => mockStartPairing(...args),
  finalizeWalletConnectPairing: (...args) => mockFinalize(...args),
  restoreWalletConnectSession: (...args) => mockRestore(...args),
  disconnectWalletConnectSession: (...args) => mockDisconnect(...args),
  signXdrWithWalletConnect: vi.fn(async () => 'SIGNED'),
}));

const WC_ADDRESS =
  'GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBRZLVIXWOI5';

describe('useWalletConnection — WalletConnect fallback (#730)', () => {
  beforeEach(() => {
    // Real timers: the hook's poll interval is 60s (outlives every test) and
    // @testing-library waitFor needs a live timer queue.
    // jsdom provides window/document; the Freighter globals are simply absent
    // (the extension-less fallback scenario).
    mockRestore.mockResolvedValue(null);
    vi.stubEnv('NEXT_PUBLIC_WC_PROJECT_ID', 'test-project');
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    window.localStorage.clear();
  });

  it('connects via WalletConnect when Freighter is absent', async () => {
    const pairing = { uri: 'wc:pair@2', qrDataUrl: 'data:image/png;base64,Q' };
    mockStartPairing.mockResolvedValue(pairing);
    // Hold approval open so the transient QR pairing state is observable.
    let resolveFinalize;
    mockFinalize.mockReturnValue(
      new Promise((resolve) => {
        resolveFinalize = resolve;
      })
    );

    const { useWalletConnection, WALLET_STATUS, WALLET_TYPE } = await import(
      '@/hooks/useWalletConnection'
    );
    const { result } = renderHook(() =>
      useWalletConnection({ pollInterval: 60_000 })
    );

    await waitFor(() =>
      expect(result.current.status).toBe(WALLET_STATUS.DISCONNECTED)
    );

    let connectPromise;
    act(() => {
      connectPromise = result.current.connectWalletConnect();
    });

    // The QR pairing surface is exposed while awaiting approval.
    await waitFor(() =>
      expect(result.current.pairing).toMatchObject({ uri: 'wc:pair@2' })
    );

    await act(async () => {
      resolveFinalize({
        address: WC_ADDRESS,
        chainId: 'stellar:testnet',
        topic: 'topic-1',
      });
      await connectPromise;
    });

    await waitFor(() => {
      expect(result.current.status).toBe(WALLET_STATUS.CONNECTED);
      expect(result.current.address).toBe(WC_ADDRESS);
      expect(result.current.walletType).toBe(WALLET_TYPE.WALLETCONNECT);
      expect(result.current.pairing).toBeNull();
    });
    expect(mockStartPairing).toHaveBeenCalledWith(result.current.expectedNetwork);
  });

  it('errors clearly when WalletConnect is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_WC_PROJECT_ID', '');
    const { useWalletConnection, WALLET_STATUS } = await import(
      '@/hooks/useWalletConnection'
    );
    const { result } = renderHook(() => useWalletConnection({ pollInterval: 60_000 }));

    await waitFor(() =>
      expect(result.current.status).toBe(WALLET_STATUS.DISCONNECTED)
    );

    let outcome;
    await act(async () => {
      outcome = await result.current.connectWalletConnect();
    });

    expect(outcome).toBeNull();
    expect(result.current.walletConnectConfigured).toBe(false);
    expect(result.current.error).toMatch(/NEXT_PUBLIC_WC_PROJECT_ID/);
  });

  it('maps a declined pairing to a friendly error', async () => {
    mockStartPairing.mockResolvedValue({ uri: 'wc:pair@2', qrDataUrl: null });
    mockFinalize.mockRejectedValue(new Error('User rejected the pairing'));

    const { useWalletConnection, WALLET_STATUS } = await import(
      '@/hooks/useWalletConnection'
    );
    const { result } = renderHook(() => useWalletConnection({ pollInterval: 60_000 }));

    await waitFor(() =>
      expect(result.current.status).toBe(WALLET_STATUS.DISCONNECTED)
    );

    let outcome;
    await act(async () => {
      outcome = await result.current.connectWalletConnect();
    });

    expect(outcome).toBeNull();
    expect(result.current.status).toBe(WALLET_STATUS.ERROR);
    expect(result.current.error).toMatch(/rejected or timed out/i);
  });

  it('restores a persisted WalletConnect session on mount (session persistence)', async () => {
    mockRestore.mockResolvedValue({
      address: WC_ADDRESS,
      chainId: 'stellar:testnet',
      topic: 'topic-1',
    });

    const { useWalletConnection, WALLET_STATUS, WALLET_TYPE } = await import(
      '@/hooks/useWalletConnection'
    );
    const { result } = renderHook(() => useWalletConnection({ pollInterval: 60_000 }));

    // Restore is deferred to a timeout so the initial Freighter refresh wins.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => {
      expect(result.current.status).toBe(WALLET_STATUS.CONNECTED);
      expect(result.current.address).toBe(WC_ADDRESS);
      expect(result.current.walletType).toBe(WALLET_TYPE.WALLETCONNECT);
    });

    // Disconnecting tears the remote session down.
    act(() => {
      result.current.disconnect();
    });
    expect(mockDisconnect).toHaveBeenCalledWith('topic-1');
    expect(result.current.status).toBe(WALLET_STATUS.DISCONNECTED);
  });

  it('does not restore when Freighter already owns the session', async () => {
    const freighterApi = await import('@stellar/freighter-api');
    freighterApi.isConnected.mockResolvedValue(true);
    freighterApi.getPublicKey.mockResolvedValue(WC_ADDRESS);
    freighterApi.getNetwork.mockResolvedValue('Test SDF Network ; September 2015');

    const { useWalletConnection } = await import('@/hooks/useWalletConnection');
    const { result } = renderHook(() => useWalletConnection({ pollInterval: 60_000 }));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => expect(result.current.address).toBe(WC_ADDRESS));
    // Freighter refresh owns the active session → restore must not fire.
    expect(mockRestore).not.toHaveBeenCalled();
  });
});
