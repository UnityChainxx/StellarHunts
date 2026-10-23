"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  isConnected,
  getPublicKey,
  requestAccess,
  getNetwork,
} from "@stellar/freighter-api";
import { Networks } from "@stellar/stellar-sdk";
import { findNetworkSwitcher, getNetworkName } from "@/lib/network";
import {
  disconnectWalletConnectSession,
  finalizeWalletConnectPairing,
  isWalletConnectConfigured,
  restoreWalletConnectSession,
  signXdrWithWalletConnect,
  startWalletConnectPairing,
} from "@/lib/walletconnect";

/**
 * The Stellar network the app expects to run on for wallet operations.
 * Override via NEXT_PUBLIC_STELLAR_NETWORK env var.
 */
export const EXPECTED_NETWORK =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK === "testnet"
    ? Networks.TESTNET
    : Networks.PUBLIC;

export const WALLET_STATUS = {
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  ERROR: "error",
};

/**
 * Which connection method produced the active session (issue #730).
 *  - "freighter": the browser extension
 *  - "walletconnect": a WalletConnect v2 pairing (QR)
 */
export const WALLET_TYPE = {
  FREIGHTER: "freighter",
  WALLETCONNECT: "walletconnect",
};

/**
 * Detect whether the Freighter extension is installed at all.
 * Freighter exposes a global at `window.freighter`; a missing global (or a
 * rejection from the API) means the extension is absent.
 */
function detectExtension() {
  if (typeof window === "undefined") return false;
  const hasGlobal =
    Boolean(window.freighter) ||
    Boolean(window.stellarWalletsKit) ||
    Boolean(window.stellarwallets);
  if (hasGlobal) return true;
  // Some builds expose Freighter through @stellar/freighter-api's adapter
  // only at runtime; if we cannot see a global, we optimistically report
  // true and let an actual API call surface the absence.
  return true;
}

/**
 * useWalletConnection
 * --------------------
 * Handles the complete Freighter wallet connection lifecycle (#290):
 *  - extension absence detection
 *  - rejected / cancelled access & signing requests
 *  - account (PUBLIC_KEY) change detection
 *  - network change detection + unsupported network handling
 *  - disconnect detection (polling + visibility/focus revalidation)
 *  - stale session revalidation
 *
 * @returns {object}
 *   @prop {string}  status            – WALLET_STATUS.*
 *   @prop {boolean} isConnected       – Freighter currently reports a wallet
 *   @prop {boolean} isExtensionInstalled
 *   @prop {string|null} address       – current Stellar public key (G...)
 *   @prop {string|null} network       – current network passphrase
 *   @prop {string}  expectedNetwork   – network passphrase the app requires
 *   @prop {boolean} unsupportedNetwork– true when on an unexpected network
 *   @prop {boolean} switchSupported   – wallet exposes a network-switch API
 *   @prop {Function} switchNetwork    – attempt a one-click network switch
 *   @prop {string}  walletType        – WALLET_TYPE.* for the active session
 *   @prop {{uri, qrDataUrl}|null} pairing – active WalletConnect pairing (QR)
 *   @prop {Function} connectWalletConnect – open a WalletConnect pairing (QR)
 *   @prop {Function} signXdr        – sign an XDR via the active wallet
 *   @prop {string|null} error         – last lifecycle error message
 *   @prop {Function} connect          – request access + populate state
 *   @prop {Function} refresh          – re-read wallet state
 *   @prop {Function} disconnect       – clear local wallet state
 */
export function useWalletConnection(opts = {}) {
  const { pollInterval = 3000 } = opts;

  const [status, setStatus] = useState(WALLET_STATUS.DISCONNECTED);
  const [isExtensionInstalled, setIsExtensionInstalled] = useState(false);
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState(null);
  const [network, setNetwork] = useState(null);
  const [unsupportedNetwork, setUnsupportedNetwork] = useState(false);
  const [switchSupported, setSwitchSupported] = useState(false);
  const [error, setError] = useState(null);
  const [walletType, setWalletType] = useState(null);
  const [pairing, setPairing] = useState(null);

  const lastAddressRef = useRef(null);
  const destroyedRef = useRef(false);
  // Which connection method owns the active session; when WalletConnect is
  // active, Freighter polling must not clobber the session state.
  const activeWalletRef = useRef(null);
  const walletConnectTopicRef = useRef(null);

  /**
   * Safely sync wallet state from Freighter without throwing.
   * Uses the "settled" pattern so extension absence / rejections map to
   * clean status instead of uncaught errors.
   */
  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;
    // A WalletConnect session is not reflected by the Freighter API; polling
    // the extension while a QR session is active would clear the state.
    if (activeWalletRef.current === WALLET_TYPE.WALLETCONNECT) return;

    const installed = detectExtension();
    setIsExtensionInstalled(installed);

    try {
      const connectedNow = await isConnected();
      setConnected(connectedNow);

      if (!connectedNow) {
        if (activeWalletRef.current === WALLET_TYPE.FREIGHTER) {
          // Freighter reports a disconnect while it owns the session.
          activeWalletRef.current = null;
          setWalletType(null);
        }
        setAddress(null);
        setNetwork(null);
        setStatus(WALLET_STATUS.DISCONNECTED);
        return;
      }

      const [pk, net] = await Promise.all([getPublicKey(), getNetwork()]);
      // The extension owns the active session; WalletConnect restore must
      // not override it and the polling loop must keep tracking it.
      if (!activeWalletRef.current) {
        activeWalletRef.current = WALLET_TYPE.FREIGHTER;
        setWalletType(WALLET_TYPE.FREIGHTER);
      }
      setAddress(pk);
      const normalized = net || Networks.PUBLIC;
      setNetwork(normalized);
      setUnsupportedNetwork(normalized !== EXPECTED_NETWORK);
      setStatus(WALLET_STATUS.CONNECTED);
      setError(null);

      // Track account switches so callers can react to a stale address.
      if (lastAddressRef.current && lastAddressRef.current !== pk) {
        setStatus(WALLET_STATUS.ERROR);
        setError(
          "Your Freighter account changed. Transaction was re-synced to the new account."
        );
      }
      lastAddressRef.current = pk;
    } catch (e) {
      // Extension absent or API errored.
      setConnected(false);
      setAddress(null);
      setStatus(WALLET_STATUS.DISCONNECTED);
      setError(null);
    }
  }, []);

  /**
   * Attempt a one-click network switch when the wallet exposes a switching
   * API. Returns `{ supported, switched }` so the UI can fall back to manual
   * instructions instead of pretending the switch happened.
   */
  const switchNetwork = useCallback(async () => {
    const switcher = findNetworkSwitcher();
    if (!switcher) {
      return { supported: false, switched: false };
    }

    setError(null);
    try {
      await switcher.call(getNetworkName(EXPECTED_NETWORK));
      await refresh();
      return { supported: true, switched: true };
    } catch (e) {
      setError(
        e?.message ||
          "Could not switch networks automatically. Please switch manually in Freighter."
      );
      return { supported: true, switched: false, error: e };
    }
  }, [refresh]);

  /**
   * Request access from Freighter (prompts the user if not yet approved).
   * Maps a user rejection / missing extension to a friendly state.
   */
  const connect = useCallback(async () => {
    if (typeof window === "undefined") return null;
    setStatus(WALLET_STATUS.CONNECTING);
    setError(null);

    try {
      // requestAccess throws on user rejection or missing extension.
      const pk = await requestAccess();
      activeWalletRef.current = WALLET_TYPE.FREIGHTER;
      setWalletType(WALLET_TYPE.FREIGHTER);
      setAddress(pk);
      lastAddressRef.current = pk;
      setConnected(true);
      setStatus(WALLET_STATUS.CONNECTED);
      try {
        const net = await getNetwork();
        setNetwork(net);
        setUnsupportedNetwork(net !== EXPECTED_NETWORK);
      } catch {
        // network unavailable — non-fatal
      }
      return pk;
    } catch (e) {
      const message =
        e?.code === 4001 || /reject|cancel/i.test(e?.message || "")
          ? "Wallet connection was rejected."
          : "Freighter is not available. Please install the Freighter extension and try again.";
      setStatus(WALLET_STATUS.ERROR);
      setError(message);
      return null;
    }
  }, []);

  /**
   * WalletConnect pairing flow (issue #730).
   *
   * Opens a pairing, exposes `{ uri, qrDataUrl }` via the `pairing` state so
   * the UI can render the QR code, then awaits wallet approval. Resolves
   * with the connected address, or null when the pairing fails / is declined.
   */
  const connectWalletConnect = useCallback(async () => {
    if (typeof window === "undefined") return null;
    if (!isWalletConnectConfigured()) {
      setStatus(WALLET_STATUS.ERROR);
      setError(
        "WalletConnect is not configured. Set NEXT_PUBLIC_WC_PROJECT_ID to enable QR pairing."
      );
      return null;
    }

    setStatus(WALLET_STATUS.CONNECTING);
    setError(null);

    try {
      const pending = await startWalletConnectPairing(EXPECTED_NETWORK);
      setPairing({ uri: pending.uri, qrDataUrl: pending.qrDataUrl });

      const { address: wcAddress, chainId, topic } =
        await finalizeWalletConnectPairing(pending);

      walletConnectTopicRef.current = topic;
      activeWalletRef.current = WALLET_TYPE.WALLETCONNECT;
      setPairing(null);
      setWalletType(WALLET_TYPE.WALLETCONNECT);
      setAddress(wcAddress);
      lastAddressRef.current = wcAddress;
      setNetwork(chainId);
      setConnected(true);
      setUnsupportedNetwork(false);
      setStatus(WALLET_STATUS.CONNECTED);
      setError(null);
      return wcAddress;
    } catch (e) {
      setPairing(null);
      setStatus(WALLET_STATUS.ERROR);
      setError(
        /reject|cancel|timeout/i.test(e?.message || "")
          ? "WalletConnect pairing was rejected or timed out."
          : e?.message || "WalletConnect pairing failed. Please try again."
      );
      return null;
    }
  }, []);

  /**
   * Re-attach a persisted WalletConnect session (session persistence, #730).
   * Runs once on mount, only when no Freighter session is live.
   */
  const restoreWalletConnect = useCallback(async () => {
    if (!isWalletConnectConfigured()) return;
    try {
      const restored = await restoreWalletConnectSession();
      if (!restored?.address || activeWalletRef.current) return;
      walletConnectTopicRef.current = restored.topic;
      activeWalletRef.current = WALLET_TYPE.WALLETCONNECT;
      setWalletType(WALLET_TYPE.WALLETCONNECT);
      setAddress(restored.address);
      setNetwork(restored.chainId);
      setConnected(true);
      setUnsupportedNetwork(false);
      setStatus(WALLET_STATUS.CONNECTED);
    } catch {
      // No stored session / client unavailable — stay disconnected.
    }
  }, []);

  /**
   * Sign an XDR blob with the active wallet: WalletConnect sessions relay the
   * request to the remote wallet; Freighter sessions sign locally.
   */
  const signXdr = useCallback(
    async (xdr) => {
      if (activeWalletRef.current === WALLET_TYPE.WALLETCONNECT) {
        return signXdrWithWalletConnect(
          walletConnectTopicRef.current,
          network,
          xdr
        );
      }
      const { signTransaction } = await import("@stellar/freighter-api");
      return signTransaction(xdr, {
        networkPassphrase: network || EXPECTED_NETWORK,
      });
    },
    [network]
  );

  /**
   * Clear local wallet state. Freighter has no programmatic disconnect, so
   * this only resets the app's view of the wallet. WalletConnect sessions
   * are torn down on both sides.
   */
  const disconnect = useCallback(() => {
    if (activeWalletRef.current === WALLET_TYPE.WALLETCONNECT) {
      const topic = walletConnectTopicRef.current;
      walletConnectTopicRef.current = null;
      disconnectWalletConnectSession(topic);
    }
    activeWalletRef.current = null;
    setWalletType(null);
    setPairing(null);
    setConnected(false);
    setAddress(null);
    setNetwork(null);
    setUnsupportedNetwork(false);
    lastAddressRef.current = null;
    setStatus(WALLET_STATUS.DISCONNECTED);
    setError(null);
  }, []);

  // Initial load + account/network listeners (#290).
  useEffect(() => {
    destroyedRef.current = false;
    setSwitchSupported(Boolean(findNetworkSwitcher()));
    refresh();

    // Restore a persisted WalletConnect session (#730) once the initial
    // Freighter refresh settles; only applies when no extension session won.
    const restoreTimer = setTimeout(() => {
      if (!destroyedRef.current && !activeWalletRef.current) {
        restoreWalletConnect();
      }
    }, 0);

    // Poll periodically to detect disconnect / unsupported network (Freighter
    // has no reliable change event through the npm API).
    const poll = setInterval(() => {
      if (!destroyedRef.current) refresh();
    }, pollInterval);

    // Re-sync on window focus / visibility — catches stale sessions when the
    // user returns to the tab after switching accounts in Freighter.
    const onFocus = () => refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    // Register Freighter's native account/network event listeners where the
    // browser global exposes them (defensive — may be undefined).
    let cleanupListeners = () => {};
    try {
      const freighterGlobal =
        window.freighter || window.stellarwallets || null;
      if (freighterGlobal?.addEventListener) {
        freighterGlobal.addEventListener("PUBLIC_KEY", () => refresh());
        freighterGlobal.addEventListener("NETWORK_CHANGE", () => refresh());
        cleanupListeners = () => {
          freighterGlobal.removeEventListener("PUBLIC_KEY", () => refresh());
          freighterGlobal.removeEventListener("NETWORK_CHANGE", () => refresh());
        };
      }
    } catch {
      // ignore — polling covers disconnect/network detection
    }

    return () => {
      destroyedRef.current = true;
      clearInterval(poll);
      clearTimeout(restoreTimer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      cleanupListeners();
    };
  }, [refresh, pollInterval]);

  return {
    status,
    isConnected: connected,
    isExtensionInstalled,
    address,
    network,
    expectedNetwork: EXPECTED_NETWORK,
    unsupportedNetwork,
    switchSupported,
    switchNetwork,
    walletType,
    pairing,
    walletConnectConfigured: isWalletConnectConfigured(),
    connectWalletConnect,
    signXdr,
    error,
    connect,
    refresh,
    disconnect,
  };
}

export default useWalletConnection;
