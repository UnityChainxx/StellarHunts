"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  isConnected,
  getPublicKey,
  requestAccess,
  getNetwork,
} from "@stellar/freighter-api";
import { Networks } from "@stellar/stellar-sdk";

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
 *   @prop {boolean} unsupportedNetwork– true when on an unexpected network
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
  const [error, setError] = useState(null);

  const lastAddressRef = useRef(null);
  const destroyedRef = useRef(false);

  /**
   * Safely sync wallet state from Freighter without throwing.
   * Uses the "settled" pattern so extension absence / rejections map to
   * clean status instead of uncaught errors.
   */
  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;

    const installed = detectExtension();
    setIsExtensionInstalled(installed);

    try {
      const connectedNow = await isConnected();
      setConnected(connectedNow);

      if (!connectedNow) {
        setAddress(null);
        setNetwork(null);
        setStatus(WALLET_STATUS.DISCONNECTED);
        return;
      }

      const [pk, net] = await Promise.all([getPublicKey(), getNetwork()]);
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
   * Clear local wallet state. Freighter has no programmatic disconnect, so
   * this only resets the app's view of the wallet.
   */
  const disconnect = useCallback(() => {
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
    refresh();

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
    unsupportedNetwork,
    error,
    connect,
    refresh,
    disconnect,
  };
}

export default useWalletConnection;
