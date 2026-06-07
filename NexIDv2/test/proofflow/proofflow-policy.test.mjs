import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  formatCountdownParts,
  hashReviewerNoteCommit,
  hashSettlementReceiptPayload,
  isMaterialEvidenceChange,
  validateEvidenceTimestamp,
  validateReviewerNoteReveal
} from "../../lib/services/proofFlowPolicy.ts";
import { projectNativeTradePayout } from "../../lib/client/native-payout.ts";
import { userFacingTransactionError } from "../../lib/client/transaction-error.ts";

test("commit reveal notes verify without storing plaintext at commit", () => {
  const noteText = "Official source showed YES within the settlement window.";
  const nonce = "reviewer-secret-nonce-001";
  const noteHash = hashReviewerNoteCommit({ noteText, nonce });

  assert.match(noteHash, /^[a-f0-9]{64}$/);
  assert.equal(validateReviewerNoteReveal({ noteText, nonce, noteHash }), true);
  assert.equal(validateReviewerNoteReveal({ noteText: `${noteText} changed`, nonce, noteHash }), false);
});

test("encrypted-note alternative is not used because commit record contains only hash fields", () => {
  const route = readFileSync("app/api/markets/[id]/proof-flow/reviewer-note/route.ts", "utf8");
  const service = readFileSync("lib/services/proofFlowService.ts", "utf8");

  assert.match(route, /proofFlowReviewerNoteSchema/);
  assert.match(service, /noteText:\s*null/);
  assert.match(service, /note:\s*isFinal \? assignment\.noteText : null/);
  assert.match(service, /commitTimestamp/);
  assert.doesNotMatch(service.match(/export async function submitProofFlowReviewerNote[\s\S]*?return getProofFlowSettlement/)?.[0] ?? "", /noteText:\s*input\.note/);
});

test("timestamp validation rejects malformed, pre-market, post-deadline and source-window violations", () => {
  const base = {
    marketOpenTime: "2026-06-01T00:00:00.000Z",
    marketCloseTime: "2026-06-05T00:00:00.000Z",
    resolutionDeadline: "2026-06-06T00:00:00.000Z",
    sourceWindowStart: "2026-06-05T00:00:00.000Z",
    sourceWindowEnd: "2026-06-06T00:00:00.000Z"
  };

  assert.equal(validateEvidenceTimestamp({ ...base, evidenceTimestamp: "bad-date" }).failures[0].code, "malformed_timestamp");
  assert.equal(validateEvidenceTimestamp({ ...base, evidenceTimestamp: "2026-05-30T00:00:00.000Z" }).failures.some((failure) => failure.code === "before_market_creation"), true);
  assert.equal(validateEvidenceTimestamp({ ...base, evidenceTimestamp: "2026-06-07T00:00:00.000Z" }).failures.some((failure) => failure.code === "after_resolution_deadline"), true);
  assert.equal(validateEvidenceTimestamp({ ...base, evidenceTimestamp: "2026-06-04T23:00:00.000Z" }).failures.some((failure) => failure.code === "before_source_window"), true);
  assert.equal(validateEvidenceTimestamp({ ...base, evidenceTimestamp: "2026-06-05T12:00:00.000Z" }).valid, true);
});

test("material evidence scoring only reaches high for outcome-impacting credible contradictions", () => {
  const low = isMaterialEvidenceChange({
    previousEvidence: {
      outcome: "ride",
      sourceUrl: "https://api.coingecko.com/api/v3/coins/bitcoin",
      evidenceText: "BTC remained above threshold.",
      evidenceTimestamp: "2026-06-05T12:00:00.000Z"
    },
    newEvidence: {
      outcome: "ride",
      sourceUrl: "https://api.coingecko.com/api/v3/coins/bitcoin",
      evidenceText: "BTC remained above threshold with another wording.",
      evidenceTimestamp: "2026-06-05T13:00:00.000Z"
    },
    marketCloseTime: "2026-06-05T00:00:00.000Z",
    resolutionDeadline: "2026-06-06T00:00:00.000Z"
  });

  const high = isMaterialEvidenceChange({
    previousEvidence: {
      outcome: "ride",
      sourceUrl: "https://example.com/blog",
      evidenceText: "YES",
      evidenceTimestamp: "2026-06-05T12:00:00.000Z"
    },
    newEvidence: {
      outcome: "fade",
      sourceUrl: "https://api.coingecko.com/api/v3/coins/bitcoin",
      evidenceText: "NO with official API capture and settlement timestamp details repeated for a material update that changes the outcome.",
      evidenceTimestamp: "2026-06-05T13:00:00.000Z"
    },
    marketCloseTime: "2026-06-05T00:00:00.000Z",
    resolutionDeadline: "2026-06-06T00:00:00.000Z"
  });

  assert.equal(low.level, "LOW");
  assert.equal(high.level, "HIGH");
});

test("countdown rendering includes hours minutes seconds", () => {
  const parts = formatCountdownParts("2026-06-05T03:04:05.000Z", new Date("2026-06-05T01:02:03.000Z"));
  assert.deepEqual({ hours: parts.hours, minutes: parts.minutes, seconds: parts.seconds }, { hours: 2, minutes: 2, seconds: 2 });
  assert.equal(parts.label, "2h 2m 2s");
});

test("receipt hash generation is deterministic and sensitive to payload changes", () => {
  const payload = { marketId: "m1", finalOutcome: "ride", bondMovement: { platformCut: 0 } };
  const first = hashSettlementReceiptPayload(payload);
  const second = hashSettlementReceiptPayload(payload);
  const changed = hashSettlementReceiptPayload({ ...payload, finalOutcome: "fade" });

  assert.equal(first, second);
  assert.notEqual(first, changed);
});

test("native displayed payout follows settlement pool math instead of shares face value", () => {
  const usdc = (value) => BigInt(value) * 1_000_000n;

  assert.equal(projectNativeTradePayout({
    collateralPool: usdc(0),
    sideSharesTotal: usdc(0),
    tradeNotional: usdc(25),
    tradeShares: usdc(50)
  }), usdc(25));

  assert.equal(projectNativeTradePayout({
    collateralPool: usdc(25),
    sideSharesTotal: usdc(0),
    tradeNotional: usdc(25),
    tradeShares: 62_500_000n
  }), usdc(50));

  assert.equal(projectNativeTradePayout({
    collateralPool: usdc(25),
    sideSharesTotal: usdc(50),
    tradeNotional: usdc(25),
    tradeShares: 41_666_666n
  }), 22_727_272n);
});

test("transaction errors are normalized before display", () => {
  const exposureCapError = new Error(`The contract function "buy" reverted with the following reason: exposure cap

Contract Call:
  function: buy(uint8 side, uint256 notional)
  args: (0, 1100000000)

Details: execution reverted: exposure cap
Version: viem@2.50.4`);

  assert.equal(
    userFacingTransactionError(exposureCapError),
    "This trade is above the early wallet limit for this market. Try a smaller amount or wait until the first-hour exposure cap ends."
  );
  assert.equal(userFacingTransactionError(new Error("User rejected the request.")), "You rejected the wallet request. No transaction was sent.");
  assert.equal(userFacingTransactionError(new Error("execution reverted: no winning shares")), "No redeemable winning shares were found for this wallet.");
  assert.equal(userFacingTransactionError(new Error("Plain backend validation failed.")), "Plain backend validation failed.");
});
