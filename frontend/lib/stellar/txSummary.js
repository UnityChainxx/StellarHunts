/**
 * Human-readable transaction summaries (issue #782).
 *
 * Every transaction StellarHunts asks a wallet to sign must first be decoded
 * into a structured, human-readable summary. The signing helper in
 * `signTransaction.js` refuses to sign anything that cannot be summarized, so
 * no operation ever reaches Freighter as opaque XDR ("blind signing").
 *
 * Scope is enforced here too: only calls to the StellarHunts game contracts
 * configured via env vars are ever considered in scope.
 */
import { Transaction, xdr, scValToNative } from "@stellar/stellar-sdk";

/** Allowed contracts, sourced from env so they can differ per network. */
export function getAllowedContractIds() {
  const configured = [
    process.env.NEXT_PUBLIC_STELLAR_HUNTS_CONTRACT_ID,
    process.env.NEXT_PUBLIC_STELLAR_HUNTS_NFT_CONTRACT_ID,
    ...(process.env.NEXT_PUBLIC_ALLOWED_CONTRACT_IDS
      ? process.env.NEXT_PUBLIC_ALLOWED_CONTRACT_IDS.split(",")
      : []),
  ];
  return new Set(configured.filter(Boolean).map((id) => id.trim()));
}

/** Contract functions the app is ever allowed to ask a user to sign. */
export function getAllowedFunctionNames() {
  const defaults = ["submit_answer", "request_hint"];
  if (process.env.NEXT_PUBLIC_ALLOWED_CONTRACT_FUNCTIONS) {
    return new Set(
      process.env.NEXT_PUBLIC_ALLOWED_CONTRACT_FUNCTIONS.split(",")
        .map((fn) => fn.trim())
        .filter(Boolean),
    );
  }
  return new Set(defaults);
}

function shorten(str, max = 24) {
  if (typeof str !== "string") return String(str);
  return str.length <= max ? str : `${str.slice(0, max)}…`;
}

/**
 * Decode a single operation into a readable summary.
 * Returns `{ readable: false, human: "…opaque operation…" }` when the
 * operation cannot be fully decoded — callers must treat that as a refusal.
 */
function summarizeOperation(op) {
  try {
    const invoke = op.body().invokeHostFunctionOp();
    const hostFunction = invoke.hostFunction();
    if (
      hostFunction.switch() !==
      xdr.HostFunctionType.hostFunctionTypeInvokeContract()
    ) {
      return {
        readable: false,
        type: "host_function",
        human: "Unsupported host function (e.g. WASM upload / create contract)",
      };
    }

    let contractId;
    try {
      contractId = hostFunction.contractAddress().address();
    } catch {
      contractId = "<unparseable contract id>";
    }

    const functionName = hostFunction.functionName().toString();
    const args = hostFunction.args().map((arg) => {
      try {
        const value = scValToNative(arg);
        return { value, human: safeStringify(value) };
      } catch {
        return { value: null, human: "<undecodable argument>" };
      }
    });

    const argText = args.length
      ? args.map((a) => shorten(a.human)).join(", ")
      : "no arguments";

    return {
      readable: contractId.startsWith("C") && functionName.length > 0,
      type: "contract_call",
      contractId,
      functionName,
      args,
      human: `Call ${functionName}(${argText}) on contract ${shorten(contractId, 16)}`,
    };
  } catch {
    // Not an InvokeHostFunction operation (payment, account merge, set
    // options, …). StellarHunts never needs these signed by a player.
    return {
      readable: false,
      type: op.type ? String(op.type) : "unknown",
      human: "Unsupported operation type — StellarHunts never signs this",
    };
  }
}

function safeStringify(value) {
  try {
    return typeof value === "object" && value !== null
      ? JSON.stringify(value)
      : String(value);
  } catch {
    return "<complex value>";
  }
}

/**
 * Summarize a transaction (a `Transaction` instance or base64 XDR) into a
 * structured, human-readable object.
 *
 * @param {import("@stellar/stellar-sdk").Transaction | string} tx
 * @param {string} networkPassphrase
 * @returns {{ readable: boolean, operations: Array, human: string[] }}
 */
export function summarizeTransaction(tx, networkPassphrase) {
  const transaction =
    typeof tx === "string" ? new Transaction(tx, networkPassphrase) : tx;

  const fee = Number(transaction.fee);
  const timeBounds = transaction.timeBounds
    ? `valid ${new Date(transaction.timeBounds.minTime * 1000).toISOString()} → ${new Date(transaction.timeBounds.maxTime * 1000).toISOString()}`
    : "no time bounds";
  const memoType = transaction.memo?.type
    ? String(transaction.memo.type)
    : "MemoNone";

  const operations = (transaction.operations || []).map(summarizeOperation);
  const human = [
    `Fee: ${fee} stroops (${(fee / 10_000).toFixed(4)} XLM)`,
    `Validity: ${timeBounds}`,
    `Memo: ${memoType}`,
    `Operations: ${operations.length}`,
    ...operations.map((op, i) => `  ${i + 1}. ${op.human}`),
  ];

  return {
    readable: operations.length > 0 && operations.every((op) => op.readable),
    operations,
    human,
  };
}
