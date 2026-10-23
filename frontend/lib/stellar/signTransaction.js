/**
 * Confirmation-gated, scope-checked signing for StellarHunts (issue #782).
 *
 * Guarantees:
 *  1. Every transaction is decoded into a human-readable summary *before* it
 *     reaches the wallet (see `txSummary.js`).
 *  2. Signing is refused unless every operation is fully readable and points
 *     at an allow-listed StellarHunts contract + function ("no blind signing").
 *  3. The user must explicitly confirm the summary; passing no `confirm`
 *     callback is an error, never a silent auto-confirm.
 *
 * Usage:
 *   import { signWithConfirmation } from "@/lib/stellar/signTransaction";
 *   const signedXdr = await signWithConfirmation({
 *     tx,                              // Transaction or base64 XDR
 *     networkPassphrase: Networks.TESTNET,
 *     confirm: (summary) => openConfirmDialog(summary), // resolves boolean
 *   });
 */
import * as StellarSdk from "@stellar/stellar-sdk";
import { signTransaction as freighterSignTransaction } from "@stellar/freighter-api";
import {
  getAllowedContractIds,
  getAllowedFunctionNames,
  summarizeTransaction,
} from "./txSummary";

/** Thrown when a transaction is not fully readable or out of scope. */
export class SigningScopeError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "SigningScopeError";
    this.details = details;
  }
}

/**
 * Enforce the signing policy: every operation must be a fully readable
 * contract call against an allow-listed StellarHunts contract and function.
 *
 * @param {ReturnType<typeof summarizeTransaction>} summary
 * @param {{ allowedContracts?: Set<string>, allowedFunctions?: Set<string> }} [policy]
 */
export function assertInScope(summary, policy = {}) {
  const allowedContracts = policy.allowedContracts ?? getAllowedContractIds();
  const allowedFunctions = policy.allowedFunctions ?? getAllowedFunctionNames();

  if (!summary.readable) {
    throw new SigningScopeError(
      "Refusing to sign: transaction contains operations that cannot be " +
        "decoded into a human-readable summary (no blind signing).",
      summary,
    );
  }

  for (const op of summary.operations) {
    if (op.type !== "contract_call") {
      throw new SigningScopeError(
        `Refusing to sign: unsupported operation type "${op.type}". Only ` +
          "StellarHunts contract calls may be signed.",
        summary,
      );
    }
    if (!allowedContracts.has(op.contractId)) {
      throw new SigningScopeError(
        `Refusing to sign: contract ${op.contractId} is not a StellarHunts ` +
          "contract. Configure NEXT_PUBLIC_STELLAR_HUNTS_CONTRACT_ID / " +
          "NEXT_PUBLIC_STELLAR_HUNTS_NFT_CONTRACT_ID.",
        summary,
      );
    }
    if (!allowedFunctions.has(op.functionName)) {
      throw new SigningScopeError(
        `Refusing to sign: function "${op.functionName}" is not in the ` +
          "allowed function list.",
        summary,
      );
    }
  }

  return summary;
}

/**
 * Build a scoped Soroban contract-call transaction for the game contracts.
 * Convenience helper so call sites never hand-roll raw operations.
 *
 * @param {{ source: string, contractId: string, method: string, args?: Array<any>, networkPassphrase: string, timeoutSeconds?: number }} params
 */
export function buildContractCall({
  source,
  contractId,
  method,
  args = [],
  networkPassphrase,
  timeoutSeconds = 30,
}) {
  const builder = new StellarSdk.TransactionBuilder(source, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      StellarSdk.Operation.invokeContract({
        contract: contractId,
        method,
        args,
      }),
    )
    .setTimeout(timeoutSeconds);
  return builder.build();
}

/**
 * Summarize → scope-check → ask the user to confirm → sign.
 *
 * @param {{
 *   tx: import("@stellar/stellar-sdk").Transaction | string,
 *   networkPassphrase: string,
 *   confirm: (summary: object, lines: string[]) => Promise<boolean> | boolean,
 *   allowedContracts?: Set<string>,
 *   allowedFunctions?: Set<string>,
 * }} params
 * @returns {Promise<string>} base64 XDR of the signed transaction envelope
 */
export async function signWithConfirmation({
  tx,
  networkPassphrase,
  confirm,
  allowedContracts,
  allowedFunctions,
}) {
  if (typeof confirm !== "function") {
    // A missing confirmation step must fail loudly, never silently sign.
    throw new SigningScopeError(
      "Refusing to sign: no confirmation step was provided. Every StellarHunts " +
        "transaction must be shown to the user as a readable summary first.",
    );
  }

  const summary = summarizeTransaction(tx, networkPassphrase);
  assertInScope(summary, { allowedContracts, allowedFunctions });

  const approved = await confirm(summary, summary.human);
  if (approved !== true) {
    throw new SigningScopeError(
      "User rejected the transaction after reviewing the summary.",
      summary,
    );
  }

  const xdr =
    typeof tx === "string" ? tx : tx.toXDR();
  return freighterSignTransaction(xdr, {
    networkPassphrase,
  });
}
