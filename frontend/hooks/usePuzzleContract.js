"use client";

import { useState, useCallback } from "react";
import {
  SorobanRpc,
  TransactionBuilder,
  Networks,
  nativeToScVal,
  scValToNative,
  xdr,
  Address,
} from "@stellar/stellar-sdk";
import {
  isConnected,
  getPublicKey,
  signTransaction,
} from "@stellar/freighter-api";

/**
 * Default RPC endpoint for the Stellar Soroban testnet.
 * Override via NEXT_PUBLIC_SOROBAN_RPC_URL env var.
 */
const DEFAULT_RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ||
  "https://soroban-testnet.stellar.org";

/**
 * The deployed contract address for StellarHunts.
 * Must be set via NEXT_PUBLIC_STELLAR_HUNTS_CONTRACT_ID env var.
 */
const DEFAULT_CONTRACT_ID =
  process.env.NEXT_PUBLIC_STELLAR_HUNTS_CONTRACT_ID || "";

/**
 * Polling interval (ms) when waiting for a Soroban transaction to complete.
 */
const POLL_INTERVAL = 1000;

/**
 * Max number of polling attempts before giving up.
 */
const MAX_POLL_ATTEMPTS = 30;

/**
 * Converts a plain string into a Soroban Bytes ScVal (UTF-8 encoded).
 * The on-chain contract stores answers/hints as `Bytes`.
 */
function stringToBytesScVal(str) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  return xdr.ScVal.scvBytes(bytes);
}

/**
 * Safely converts a Soroban Bytes ScVal back into a UTF-8 string.
 * Returns the original ScVal hex if decoding fails.
 */
function bytesScValToString(scVal) {
  try {
    const raw = scVal.value();
    if (raw && raw.length) {
      const decoder = new TextDecoder("utf-8");
      return decoder.decode(raw);
    }
  } catch {
    // Non-UTF-8 bytes — fall back to hex
    if (scVal.value()?.length) {
      return `0x${Buffer.from(scVal.value()).toString("hex").slice(0, 32)}…`;
    }
  }
  return "";
}

/**
 * Polls SorobanRpc.Server#getTransaction until the transaction
 * reaches a terminal status (SUCCESS / FAILED).
 */
async function pollTransaction(server, hash, attempts = 0) {
  if (attempts >= MAX_POLL_ATTEMPTS) {
    throw new Error("Transaction did not finalise in time");
  }

  const result = await server.getTransaction(hash);

  if (result.status === "NOT_FOUND") {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    return pollTransaction(server, hash, attempts + 1);
  }

  if (result.status === "FAILED") {
    throw new Error(
      result.result?.error?.message ||
        result.error?.message ||
        "Transaction failed on chain"
    );
  }

  return result;
}

/**
 * usePuzzleContract
 *
 * React hook that manages all Soroban smart-contract interactions for the
 * StellarHunts puzzle game.  Requires the Freighter browser extension.
 *
 * @param {object}      opts
 * @param {string}      opts.rpcUrl              – Soroban RPC endpoint (defaults to testnet)
 * @param {string}      opts.contractId          – Deployed contract address (hex string)
 * @param {string}      opts.networkPassphrase   – Stellar network passphrase
 *
 * @returns {object}
 *   @prop {boolean}     submitting      – true while a submit_answer tx is in flight
 *   @prop {boolean}     hintLoading     – true while a request_hint tx is in flight
 *   @prop {string|null} error           – last error message
 *   @prop {object|null} feedback        – { correct: boolean, message: string } | null
 *   @prop {string|null} lastHint        – the hint returned from the contract
 *   @prop {boolean}     walletConnected – whether Freighter reports a connection
 *   @prop {string|null} walletAddress   – the user's Stellar public key
 *   @prop {Function}    submitAnswer    – async (questionId: number, answer: string) => { correct, message }
 *   @prop {Function}    requestHint     – async (questionId: number) => string
 *   @prop {Function}    clearFeedback   – reset feedback & error to null
 *   @prop {Function}    checkWallet     – refresh wallet connected state
 */
export function usePuzzleContract(opts = {}) {
  const {
    rpcUrl = DEFAULT_RPC_URL,
    contractId = DEFAULT_CONTRACT_ID,
    networkPassphrase = Networks.TESTNET,
  } = opts;

  // Guard: warn early if no contract ID is configured
  if (!contractId && typeof console !== "undefined") {
    console.warn(
      "[usePuzzleContract] NEXT_PUBLIC_STELLAR_HUNTS_CONTRACT_ID is not set. " +
        "Contract calls will fail at runtime."
    );
  }

  const [submitting, setSubmitting] = useState(false);
  const [hintLoading, setHintLoading] = useState(false);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [lastHint, setLastHint] = useState(null);
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState(null);

  // ---- Wallet helpers ------------------------------------------------

  const checkWallet = useCallback(async () => {
    try {
      const connected = await isConnected();
      setWalletConnected(connected);
      if (connected) {
        const pk = await getPublicKey();
        setWalletAddress(pk);
        return pk;
      }
      setWalletAddress(null);
      return null;
    } catch {
      setWalletConnected(false);
      setWalletAddress(null);
      return null;
    }
  }, []);

  const ensureWallet = useCallback(async () => {
    const pk = await checkWallet();
    if (!pk) {
      throw new Error(
        "Freighter wallet is not connected. Please install & connect Freighter."
      );
    }
    return pk;
  }, [checkWallet]);

  // ---- Soroban helpers -----------------------------------------------

  const buildServer = useCallback(() => {
    if (!contractId) {
      throw new Error(
        "Contract ID is not configured. Set NEXT_PUBLIC_STELLAR_HUNTS_CONTRACT_ID."
      );
    }
    return { server: new SorobanRpc.Server(rpcUrl), contractId };
  }, [rpcUrl, contractId]);

  /**
   * Signs & sends a Soroban transaction via Freighter, then polls for
   * the result and returns the raw SorobanRpc.GetTransaction response.
   */
  const invokeContract = useCallback(
    async (methodName, scValArgs) => {
      const publicKey = await ensureWallet();
      const { server, contractId: cId } = buildServer();

      const sourceAccount = await server.getAccount(publicKey);
      const contract = new SorobanRpc.Contract(cId);

      const tx = new TransactionBuilder(sourceAccount, {
        fee: "100",
        networkPassphrase,
      })
        .addOperation(contract.call(methodName, ...scValArgs))
        .setTimeout(30)
        .build();

      // 1) Prepare (simulate & populate footprint / auth)
      const preparedTx = await server.prepareTransaction(tx);

      // 2) Sign with Freighter
      const signedXdr = await signTransaction(preparedTx.toXDR(), {
        networkPassphrase,
      });
      const signedTx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);

      // 3) Submit
      const sendResponse = await server.sendTransaction(signedTx);
      if (
        sendResponse.status === "PENDING" ||
        sendResponse.status === "DUPLICATE"
      ) {
        // 4) Poll for completion
        const result = await pollTransaction(server, sendResponse.hash);
        return result;
      }

      throw new Error(
        sendResponse.error?.message ||
          `Unexpected send status: ${sendResponse.status}`
      );
    },
    [ensureWallet, buildServer, networkPassphrase]
  );

  // ---- Public actions ------------------------------------------------

  /**
   * Submit an answer for a puzzle.
   *
   * @param {number} questionId  – The on-chain question_id (u64)
   * @param {string} answer      – The plain-text answer
   * @returns {{ correct: boolean, message: string }}
   */
  const submitAnswer = useCallback(
    async (questionId, answer) => {
      setSubmitting(true);
      setError(null);
      setFeedback(null);

      try {
        // Build ScVal arguments for the contract's submit_answer fn:
        //   submit_answer(env, caller: Address, question_id: u64, answer: Bytes) -> bool
        const args = [
          Address.fromString(walletAddress || (await ensureWallet())).toScVal(),
          nativeToScVal(BigInt(questionId), { type: "u64" }),
          stringToBytesScVal(answer),
        ];

        const result = await invokeContract("submit_answer", args);

        // Parse the return value (bool)
        const isCorrect = scValToNative(result.returnValue);

        const fb = {
          correct: isCorrect,
          message: isCorrect
            ? "🎉 Correct! Well done!"
            : "❌ Incorrect answer. Try again!",
        };
        setFeedback(fb);
        return fb;
      } catch (err) {
        const message = err.message || "Transaction failed";
        setError(message);
        setFeedback({ correct: false, message });
        return { correct: false, message };
      } finally {
        setSubmitting(false);
      }
    },
    [invokeContract, walletAddress, ensureWallet]
  );

  /**
   * Request a hint for a puzzle from the smart contract.
   *
   * @param {number} questionId
   * @returns {string} The hint text
   */
  const requestHint = useCallback(
    async (questionId) => {
      setHintLoading(true);
      setError(null);

      try {
        // Build ScVal args:
        //   request_hint(env, caller: Address, question_id: u64) -> Bytes
        const args = [
          Address.fromString(walletAddress || (await ensureWallet())).toScVal(),
          nativeToScVal(BigInt(questionId), { type: "u64" }),
        ];

        const result = await invokeContract("request_hint", args);

        // Return value is Bytes — decode to string
        const hint = bytesScValToString(result.returnValue);
        setLastHint(hint);
        return hint;
      } catch (err) {
        const message = err.message || "Failed to fetch hint";
        setError(message);
        throw err;
      } finally {
        setHintLoading(false);
      }
    },
    [invokeContract, walletAddress, ensureWallet]
  );

  const clearFeedback = useCallback(() => {
    setFeedback(null);
    setError(null);
  }, []);

  return {
    submitting,
    hintLoading,
    error,
    feedback,
    lastHint,
    walletConnected,
    walletAddress,
    submitAnswer,
    requestHint,
    clearFeedback,
    checkWallet,
  };
}

export default usePuzzleContract;
