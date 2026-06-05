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
