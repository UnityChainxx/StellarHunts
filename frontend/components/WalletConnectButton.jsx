"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import NetworkMismatchBanner from "@/components/NetworkMismatchBanner";
import { useWalletConnection, WALLET_STATUS, WALLET_TYPE } from "@/hooks/useWalletConnection";

/**
 * localStorage key used to persist the last connected Stellar address so the
 * button can show a stable session across page reloads (#691).
 */
const STORAGE_KEY = "stellarhunts.wallet.address";

/**
 * Shorten a Stellar public key for display, e.g. GABCDE...WXYZ.
 */
function shortenAddress(address) {
  if (!address) return "";
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/**
 * WalletConnectButton
 * --------------------
 * Wallet connect button (#691, extended by #730). Wraps `useWalletConnection`
 * to expose a single control that:
 *  - connects / disconnects via Freighter
 *  - connects via WalletConnect QR pairing (#730) when the extension is
 *    absent or the user prefers a mobile wallet
 *  - displays the active account address and the connection method
 *  - surfaces a user rejection or a missing extension
 *  - restores the last connected address across reloads
 */
export default function WalletConnectButton({ className = "" }) {
  const {
    status,
    address,
    network,
    expectedNetwork,
    unsupportedNetwork,
    switchSupported,
    switchNetwork,
    error,
    isExtensionInstalled,
    walletType,
    pairing,
    walletConnectConfigured,
    connectWalletConnect,
    connect,
    disconnect,
    refresh,
  } = useWalletConnection();

  const [showQrModal, setShowQrModal] = useState(false);

  const isConnecting = status === WALLET_STATUS.CONNECTING;
  const isConnected = status === WALLET_STATUS.CONNECTED && Boolean(address);
  const isWalletConnectSession = walletType === WALLET_TYPE.WALLETCONNECT;

  // Keep the QR modal in sync with the pairing lifecycle.
  useEffect(() => {
    if (pairing) setShowQrModal(true);
    if (isConnected && isWalletConnectSession) setShowQrModal(false);
  }, [pairing, isConnected, isWalletConnectSession]);

  // Persist the connected address so a reload keeps showing the active
  // account instead of flashing back to the disconnected state.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isConnected && address) {
      window.localStorage.setItem(STORAGE_KEY, address);
    } else if (status === WALLET_STATUS.DISCONNECTED) {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [isConnected, address, status]);

  const handleWalletConnect = async () => {
    setShowQrModal(true);
    await connectWalletConnect();
  };

  return (
    <div className={className}>
      {isConnected ? (
        <div className="flex items-center gap-3">
          <span
            className="font-mono text-sm text-neutral-700 dark:text-neutral-200"
            title={address}
          >
            {shortenAddress(address)}
          </span>
          {isWalletConnectSession && (
            <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
              WalletConnect
            </span>
          )}
          <Button variant="outline" size="sm" onClick={disconnect}>
            Disconnect
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={connect}
            disabled={isConnecting}
            aria-busy={isConnecting}
          >
            {isConnecting ? (
              <>
                <LoadingSpinner size="sm" />
                Connecting
              </>
            ) : (
              "Connect Wallet"
            )}
          </Button>

          {/* WalletConnect fallback / alternative (#730). Prominent when the
              extension is absent so mobile users still have a way in. */}
          {!isConnected && walletConnectConfigured && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleWalletConnect}
              disabled={isConnecting}
              aria-busy={isConnecting}
            >
              {isConnecting ? (
                <>
                  <LoadingSpinner size="sm" />
                  Pairing
                </>
              ) : (
                "Use WalletConnect"
              )}
            </Button>
          )}
        </div>
      )}

      {isConnected && unsupportedNetwork && (
        <div className="mt-3 w-full">
          <NetworkMismatchBanner
            currentNetwork={network}
            expectedNetwork={expectedNetwork}
            canSwitch={switchSupported && !isWalletConnectSession}
            onSwitch={switchNetwork}
            onRetry={refresh}
          />
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-500" role="alert">
          {error}
        </p>
      )}

      {!error && !isConnected && status === WALLET_STATUS.DISCONNECTED && !isExtensionInstalled && (
        <p className="mt-2 text-xs text-neutral-500">
          Freighter extension not detected. You can still connect with
          WalletConnect from a mobile wallet.
        </p>
      )}

      {showQrModal && pairing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="WalletConnect QR pairing"
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-xl dark:bg-neutral-900">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              Connect with WalletConnect
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Scan this code with your mobile wallet to pair.
            </p>
            <div className="mt-4 flex justify-center">
              {pairing.qrDataUrl ? (
                <img
                  src={pairing.qrDataUrl}
                  alt="WalletConnect pairing QR code"
                  className="h-56 w-56 rounded-lg"
                />
              ) : (
                <textarea
                  readOnly
                  value={pairing.uri || ""}
                  aria-label="WalletConnect pairing URI"
                  className="h-28 w-full rounded-md border border-neutral-300 p-2 font-mono text-xs dark:border-neutral-700"
                />
              )}
            </div>
            <p className="mt-4 flex items-center justify-center gap-2 text-sm text-neutral-500">
              <LoadingSpinner size="sm" />
              Waiting for approval…
            </p>
            <button
              type="button"
              onClick={() => {
                setShowQrModal(false);
                disconnect();
              }}
              className="mt-4 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
            >
              Cancel pairing
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
