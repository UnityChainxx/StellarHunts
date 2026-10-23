/**
 * WalletConnect wrapper tests — issue #730.
 *
 * Covers the QR/pairing lifecycle, session persistence and teardown of
 * `lib/walletconnect.js` against a mocked WalletConnect SignClient.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── SignClient mock ──────────────────────────────────────────────────────────

const mockClient = {
  connect: vi.fn(),
  request: vi.fn(),
  disconnect: vi.fn(),
  session: { get: vi.fn() },
};

vi.mock('@walletconnect/sign-client', () => ({
  SignClient: {
    init: vi.fn(async () => mockClient),
  },
}));

vi.mock('@walletconnect/utils', () => ({
  getSdkError: vi.fn((name) => ({ code: 6000, message: name })),
}));

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(async () => 'data:image/png;base64,FAKEQR') },
}));

const SESSION = {
  topic: 'topic-1',
  namespaces: {
    stellar: {
      accounts: ['stellar:testnet:GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBRZLVIXWOI5'],
    },
  },
};

describe('lib/walletconnect — WalletConnect v2 pairing lifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_WC_PROJECT_ID', 'test-project-id');
    window.localStorage.clear();
    mockClient.session.get.mockReturnValue(SESSION);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function loadLib() {
    return import('@/lib/walletconnect');
  }

  it('reports configured when a project id is present', async () => {
    const lib = await loadLib();
    expect(lib.isWalletConnectConfigured()).toBe(true);
  });

  it('is not configured without a project id', async () => {
    vi.stubEnv('NEXT_PUBLIC_WC_PROJECT_ID', '');
    const lib = await loadLib();
    expect(lib.isWalletConnectConfigured()).toBe(false);
    await expect(lib.startWalletConnectPairing('testnet')).rejects.toThrow(
      /NEXT_PUBLIC_WC_PROJECT_ID/
    );
  });

  it('starts a pairing with a QR data URL and completes on approval', async () => {
    const approval = vi.fn(async () => SESSION);
    mockClient.connect.mockResolvedValue({
      uri: 'wc:test-topic@2?relay-protocol=irn',
      approval,
    });

    const lib = await loadLib();
    const pairing = await lib.startWalletConnectPairing('testnet');

    expect(pairing.uri).toBe('wc:test-topic@2?relay-protocol=irn');
    expect(pairing.qrDataUrl).toBe('data:image/png;base64,FAKEQR');
    expect(mockClient.connect).toHaveBeenCalledWith({
      requiredNamespaces: {
        stellar: {
          chains: ['stellar:testnet'],
          methods: ['stellar_signXdr', 'stellar_signTransaction'],
          events: ['accountsChanged'],
        },
      },
    });

    const result = await lib.finalizeWalletConnectPairing(pairing);
    expect(result).toMatchObject({
      address: 'GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBRZLVIXWOI5',
      chainId: 'stellar:testnet',
      topic: 'topic-1',
    });
    // Session persistence: the topic is stored for later restore.
    expect(window.localStorage.getItem('stellarhunts.walletconnect.topic')).toBe('topic-1');
  });

  it('restores a persisted session after a reload', async () => {
    window.localStorage.setItem('stellarhunts.walletconnect.topic', 'topic-1');

    const lib = await loadLib();
    const restored = await lib.restoreWalletConnectSession();

    expect(mockClient.session.get).toHaveBeenCalledWith('topic-1');
    expect(restored).toMatchObject({
      address: 'GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBRZLVIXWOI5',
      topic: 'topic-1',
    });
  });

  it('clears the stored topic when the session no longer exists', async () => {
    window.localStorage.setItem('stellarhunts.walletconnect.topic', 'topic-1');
    mockClient.session.get.mockReturnValue(undefined);

    const lib = await loadLib();
    expect(await lib.restoreWalletConnectSession()).toBeNull();
    expect(window.localStorage.getItem('stellarhunts.walletconnect.topic')).toBeNull();
  });

  it('returns null when nothing was stored', async () => {
    const lib = await loadLib();
    expect(await lib.restoreWalletConnectSession()).toBeNull();
    expect(mockClient.session.get).not.toHaveBeenCalled();
  });

  it('signs XDR through the relay with the session topic and chain', async () => {
    mockClient.request.mockResolvedValue('SIGNED_XDR_BLOB');
    const lib = await loadLib();

    const signed = await lib.signXdrWithWalletConnect(
      'topic-1',
      'stellar:testnet',
      'UNSIGNED_XDR'
    );

    expect(signed).toBe('SIGNED_XDR_BLOB');
    expect(mockClient.request).toHaveBeenCalledWith({
      topic: 'topic-1',
      chainId: 'stellar:testnet',
      request: { method: 'stellar_signXdr', params: { xdr: 'UNSIGNED_XDR' } },
    });
  });

  it('disconnects the remote session and clears persistence', async () => {
    window.localStorage.setItem('stellarhunts.walletconnect.topic', 'topic-1');
    mockClient.disconnect.mockResolvedValue(undefined);

    const lib = await loadLib();
    await lib.disconnectWalletConnectSession('topic-1');

    expect(mockClient.disconnect).toHaveBeenCalled();
    expect(window.localStorage.getItem('stellarhunts.walletconnect.topic')).toBeNull();
  });

  it('clears persistence even when the remote session is already gone', async () => {
    mockClient.disconnect.mockRejectedValue(new Error('No session'));
    const lib = await loadLib();

    await expect(lib.disconnectWalletConnectSession('topic-1')).resolves.toBeUndefined();
    expect(window.localStorage.getItem('stellarhunts.walletconnect.topic')).toBeNull();
  });
});
