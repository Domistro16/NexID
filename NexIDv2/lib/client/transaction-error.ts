function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

function hasAny(value: string, patterns: string[]) {
  return patterns.some((pattern) => value.includes(pattern));
}

function isWalletOrContractError(value: string) {
  return hasAny(value, [
    "contract call:",
    "execution reverted",
    "the contract function",
    "estimatecontractgas",
    "writecontract",
    "user rejected",
    "user denied",
    "insufficient funds",
    "gas required exceeds allowance",
    "internal json-rpc error",
    "rate limit",
    "viem@"
  ]);
}

export function userFacingTransactionError(error: unknown, fallback = "Transaction failed.") {
  const raw = errorText(error).trim();
  if (!raw) return fallback;

  const normalized = raw.toLowerCase();

  if (hasAny(normalized, ["user rejected", "user denied", "rejected the request", "request rejected"])) {
    return "You rejected the wallet request. No transaction was sent.";
  }

  if (normalized.includes("price_impact_too_high")) {
    return "Trade too large for current market depth. Split into smaller trades.";
  }

  if (normalized.includes("not trading")) {
    return "This market is not open for trading yet.";
  }

  if (normalized.includes("market closed")) {
    return "This market has already closed. Trading is disabled.";
  }

  if (normalized.includes("no winning shares")) {
    return "No redeemable winning shares were found for this wallet.";
  }

  if (normalized.includes("nothing to refund")) {
    return "No refundable position was found for that side.";
  }

  if (normalized.includes("refund unavailable")) {
    return "Refunds are not available for this market state yet.";
  }

  if (normalized.includes("not settled")) {
    return "Claims unlock after final settlement is written onchain.";
  }

  if (normalized.includes("insufficient pool")) {
    return "This market does not have enough available collateral for that action.";
  }

  if (hasAny(normalized, ["insufficient funds", "not enough funds", "gas required exceeds allowance"])) {
    return "Your wallet does not have enough ETH for gas or token balance for this transaction.";
  }

  if (hasAny(normalized, ["insufficient allowance", "erc20insufficientallowance", "transfer amount exceeds allowance"])) {
    return "Token approval is not high enough yet. Approve the required amount, wait a few seconds for Base to reflect it, then try again.";
  }

  if (hasAny(normalized, ["insufficient balance", "erc20insufficientbalance", "transfer amount exceeds balance"])) {
    return "Your wallet does not have enough token balance for this transaction.";
  }

  if (normalized.includes("template not allowed")) {
    return "This market type is not enabled onchain yet. Try another market style or wait for the template to be enabled.";
  }

  if (hasAny(normalized, ["wrong network", "chain mismatch", "unsupported chain"])) {
    return "Your wallet is on the wrong network. Switch to the market network and try again.";
  }

  if (hasAny(normalized, ["rate limit", "too many requests", "internal json-rpc error", "timeout", "timed out"])) {
    return "The Base RPC is busy or still catching up. Wait a moment, then try again.";
  }

  if (hasAny(normalized, ["execution reverted", "the contract function", "contract call:", "estimatecontractgas"])) {
    return "The contract rejected this action in the current market state. Check the amount, market status, and wallet, then try again.";
  }

  if (isWalletOrContractError(normalized)) return fallback;
  return raw;
}
