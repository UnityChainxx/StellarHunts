/**
 * WalletConnect support for the StellarHunts frontend (issue #730).
 *
 * Implements the WalletConnect v2 pairing lifecycle as an alternative to the
 * Freighter browser extension:
 *   - QR / pairing flow: `startWalletConnectPairing()` returns the pairing
 *     URI plus a ready-to-render QR data URL, and an `approval()` promise
 *     that resolves with the accepted session.
 *   - Session persistence: the approved session topic is stored in
 *     localStorage and re-attached by `restoreWalletConnectSession()` on the
 *     next visit (the SignClient itself rehydrates the session payload from
 *     its own storage).
 *   - Fallback when Freighter is absent: `useWalletConnection` exposes
 *     `connectWalletConnect()` so the UI can offer it when no extension is
 *     detected.
 *
 * `@walletconnect/sign-client` is imported lazily (dynamic import) so it is
 * only fetched when a pairing actually starts — tests and Freighter-only
 * users never load it.
 *
 * Configuration: a WalletConnect Cloud project ID via
 * `NEXT_PUBLIC_WC_PROJECT_ID`. Without it `isWalletConnectConfigured()`
 * returns false and the UI hides/disables the WalletConnect option.
 */

const STORAGE_KEY = "stellarhunts.walletconnect.topic";

/** WalletConnect Cloud project id (env-configurable, empty by default). */
export const WC_PROJECT_ID =
  process.env.NEXT_PUBLIC_WC_PROJECT_ID || "";

/** CAIP-2 chain namespace for Stellar; the reference is the network name. */
const STELLAR_CHAIN_NAMESPACE = "stellar";

/**
 * Resolve the CAIP-2 reference wallets use. Callers pass the app's expected
 * network passphrase (see useWalletConnection), so honour both the raw env
 * setting and the passphrase form.
 */
function chainReferenceForNetwork(expectedNetwork) {
  const env = (process.env.NEXT_PUBLIC_STELLAR_NETWORK || "").toLowerCase();
  if (env === "testnet") return "testnet";
  if (/test\s*sdf|testnet/i.test(expectedNetwork || "")) return "testnet";
  return "pubnet";
}

function chainIdForNetwork(network) {
  return `${STELLAR_CHAIN_NAMESPACE}:${chainReferenceForNetwork(network)}`;
}

export function isWalletConnectConfigured() {
  return Boolean(WC_PROJECT_ID);
}

/**
 * SignClient singleton — the client keeps its own session store, so a single
 * instance is shared across the app for the lifetime of the page.
 */
let clientPromise = null;

async function getClient() {
  if (!WC_PROJECT_ID) {
    throw new Error(
      "WalletConnect is not configured. Set NEXT_PUBLIC_WC_PROJECT_ID to enable it."
    );
  }
  if (!clientPromise) {
    clientPromise = import("@walletconnect/sign-client").then(
      ({ SignClient }) =>
        SignClient.init({
          projectId: WC_PROJECT_ID,
          metadata: {
            name: "StellarHunts",
            description:
              "Cryptographic puzzle hunts with on-chain Stellar rewards.",
            url: typeof window !== "undefined" ? window.location.origin : "",
            icons: [],
          },
        })
    );
  }
  return clientPromise;
}

function storedTopic() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

function storeTopic(topic) {
  if (typeof window === "undefined") return;
  if (topic) {
    window.localStorage.setItem(STORAGE_KEY, topic);
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

/**
 * Extracts the first stellar account from a WalletConnect session.
 * Accounts are CAIP-10 formatted: `stellar:<network>:<G... address>`.
 */
export function addressFromSession(session) {
  const accounts = session?.namespaces?.stellar?.accounts || [];
  const first = accounts[0] || "";
  const [, reference, address] = first.split(":");
  return {
    address: address || null,
    chainId: reference
      ? `${STELLAR_CHAIN_NAMESPACE}:${reference}`
      : null,
    topic: session?.topic || null,
  };
}

async function qrDataUrl(uri) {
  try {
    const QRCode = (await import("qrcode")).default;
    return await QRCode.toDataURL(uri, { margin: 1, width: 256 });
  } catch {
    return null;
  }
}

/**
 * Opens a WalletConnect pairing session.
 *
 * @returns {Promise<{uri: string, qrDataUrl: string|null, approval: function}>}
 *   Render the QR (`qrDataUrl`) and/or show `uri` as a copyable link, then
 *   await `approval()` which resolves with the accepted session (or rejects
 *   if the user declines / times out).
 */
export async function startWalletConnectPairing(expectedNetwork) {
  const client = await getClient();
  const chainId = chainIdForNetwork(expectedNetwork);

  const { uri, approval } = await client.connect({
    requiredNamespaces: {
      [STELLAR_CHAIN_NAMESPACE]: {
        chains: [chainId],
        methods: ["stellar_signXdr", "stellar_signTransaction"],
        events: ["accountsChanged"],
      },
    },
  });

  return {
    uri,
    qrDataUrl: uri ? await qrDataUrl(uri) : null,
    approval,
  };
}

/**
 * Completes a pairing started by `startWalletConnectPairing`, persists the
 * session topic and returns the connected account details.
 */
export async function finalizeWalletConnectPairing(pairing) {
  const session = await pairing.approval();
  const { address, chainId, topic } = addressFromSession(session);
  storeTopic(topic);
  return { address, chainId, topic };
}

/**
 * Re-attaches a previously approved session after a page reload.
 *
 * @returns {Promise<{address: string, chainId: string, topic: string} | null>}
 *   null when nothing was stored or the session no longer exists (e.g. the
 *   wallet deleted it remotely).
 */
export async function restoreWalletConnectSession() {
  const topic = storedTopic();
  if (!topic) return null;

  const client = await getClient();
  const session = client.session.get(topic);
  if (!session) {
    // Session is gone (expired / deleted remotely) — clear the stale topic.
    storeTopic(null);
    return null;
  }
  return addressFromSession(session);
}

/**
 * Tears down the WalletConnect session (both sides) and clears the local
 * persistence.
 */
export async function disconnectWalletConnectSession(topic) {
  storeTopic(null);
  if (!topic) return;
  const client = await getClient();
  const { getSdkError } = await import("@walletconnect/utils");
  try {
    await client.disconnect({
      topic,
      reason: getSdkError("USER_DISCONNECTED"),
    });
  } catch {
    // The session may already be gone; the local state is cleared regardless.
  }
}

/**
 * Requests an XDR signature over the WalletConnect relay. Resolves with the
 * signed XDR returned by the wallet, or rejects when the user declines.
 */
export async function signXdrWithWalletConnect(topic, chainId, xdr) {
  const client = await getClient();
  return client.request({
    topic,
    chainId,
    request: { method: "stellar_signXdr", params: { xdr } },
  });
}
