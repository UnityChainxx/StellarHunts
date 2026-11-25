/**
 * Default `WalletAuthAdapter` backed by the Freighter browser extension
 * (`@stellar/freighter-api`), following the same detection and error-mapping
 * approach as `frontend/hooks/useWalletConnection.js`.
 *
 * The module is imported lazily so tests and WalletConnect-only sessions never
 * load the Freighter client.
 */

import type { WalletAuthAdapter } from '../types/wallet-auth';

/** Thrown when no Stellar wallet extension is present. */
export class WalletNotInstalledError extends Error {
  readonly code = 'wallet-not-installed';
  constructor() {
    super(
      'No Stellar wallet detected. Install the Freighter extension or connect a WalletConnect-compatible wallet.',
    );
    this.name = 'WalletNotInstalledError';
  }
}

function isUserRejection(error: unknown): boolean {
  const e = error as { code?: number; message?: string } | null;
  return (
    e?.code === 4001 || /reject|cancel|denied/i.test(e?.message ?? '')
  );
}

function detectExtension(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window as { freighter?: unknown }).freighter ||
      (window as { stellarWalletsKit?: unknown }).stellarWalletsKit ||
      (window as { stellarwallets?: unknown }).stellarwallets,
  );
}

/**
 * Resolve the connected account address, requesting access first when the
 * extension is installed but has not approved the app yet.
 */
async function resolveAddress(): Promise<string> {
  const api = await import('@stellar/freighter-api');

  let connected = false;
  try {
    connected = await api.isConnected();
  } catch {
    connected = false;
  }

  if (!connected) {
    try {
      return await api.requestAccess();
    } catch (error) {
      if (isUserRejection(error)) {
        const rejected = new Error('Wallet connection was rejected.');
        rejected.name = 'WalletConnectionRejected';
        throw rejected;
      }
      throw new WalletNotInstalledError();
    }
  }

  try {
    return await api.getPublicKey();
  } catch {
    throw new WalletNotInstalledError();
  }
}

/**
 * Sign the challenge message with the wallet. Freighter exposes `signBlob`
 * for arbitrary payloads; the backend verifies the raw ed25519 signature
 * over the UTF-8 message bytes, so we return the base64 signature only.
 */
async function signChallengeMessage(
  message: string,
  address: string,
): Promise<string> {
  const api = await import('@stellar/freighter-api');
  const NodeBuffer = (globalThis as { Buffer?: typeof Buffer }).Buffer;
  const blob = NodeBuffer
    ? NodeBuffer.from(message, 'utf8')
    : new TextEncoder().encode(message);

  const result = await api.signBlob(address, blob as never);

  // signBlob resolves to a DecoratedSignature ({ signature, signerAddress, ... })
  // in current Freighter API versions; tolerate plain-string results too.
  if (typeof result === 'string') return result;
  const signature = (result as { signature?: string })?.signature;
  if (typeof signature === 'string' && signature.length > 0) return signature;
  throw new Error('Wallet did not return a signature for the challenge.');
}

/**
 * Freighter-backed adapter. Wallets that cannot sign arbitrary messages
 * (e.g. some WalletConnect pairings) should inject their own adapter via the
 * `wallet` option of `useWalletAuth`.
 */
export function createFreighterWalletAdapter(): WalletAuthAdapter {
  return {
    async connect() {
      if (!detectExtension()) {
        // The npm API can still work in some embedded environments; attempt a
        // real call and only then report the wallet as missing.
        try {
          const api = await import('@stellar/freighter-api');
          if (!(await api.isConnected())) {
            throw new WalletNotInstalledError();
          }
        } catch (error) {
          if (error instanceof WalletNotInstalledError) throw error;
          throw new WalletNotInstalledError();
        }
      }
      return resolveAddress();
    },
    signMessage: signChallengeMessage,
  };
}

export default createFreighterWalletAdapter;
