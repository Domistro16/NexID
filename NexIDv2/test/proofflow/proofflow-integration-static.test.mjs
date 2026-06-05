import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = () => readFileSync("lib/services/proofFlowService.ts", "utf8");
const panel = () => readFileSync("components/nexmarkets/proof-flow-panel.tsx", "utf8");

test("conflict reporting has public API, moderation queue and confirmed conflict reevaluation", () => {
  const publicRoute = readFileSync("app/api/markets/[id]/proof-flow/reviewer-conflict/route.ts", "utf8");
  const internalRoute = readFileSync("app/api/internal/proof-flow/conflicts/route.ts", "utf8");
  const source = service();

  assert.match(publicRoute, /reportProofFlowReviewerConflict/);
  assert.match(internalRoute, /reviewProofFlowReviewerConflict/);
  assert.match(source, /proofFlowReviewerConflictReport\.create/);
  assert.match(source, /proofFlowReviewerConflictReport\.update/);
  assert.match(source, /reviewer_conflict_confirmed/);
  assert.match(source, /evaluateProofFlowReviewPanel\(db, activePanel\.id\)/);
});

test("refund execution is queued, retryable and transaction-backed", () => {
  const source = service();
  const refundRoute = readFileSync("app/api/internal/proof-flow/refunds/run/route.ts", "utf8");

  assert.match(source, /proofFlowRefundQueue\.create/);
  assert.match(source, /status:\s*"PROCESSING"/);
  assert.match(source, /status:\s*"COMPLETED"/);
  assert.match(source, /status:\s*"FAILED"/);
  assert.match(source, /writeContract/);
  assert.match(source, /functionName:\s*"transfer"/);
  assert.match(refundRoute, /executeProofFlowRefundQueue/);
});

test("reputation stays pending until final resolution confirmation", () => {
  const source = service();

  assert.match(source, /proofFlowReviewerReputationLedger\.create/);
  assert.match(source, /status:\s*"PENDING"/);
  assert.match(source, /confirmPendingReviewerReputation/);
  assert.match(source, /status:\s*"CONFIRMED"/);
  assert.match(source, /finalizationRequired:\s*true/);
});

test("second-panel reviewers are isolated from first-panel conclusions before finalization", () => {
  const source = service();

  assert.match(source, /secondPanelReviewerIsolation/);
  assert.match(source, /visibleReviewPanels\s*=\s*secondPanelReviewerIsolation[\s\S]*?reviewPanels\.filter\(\(panel\) => panel\.id === currentPanel\.id\)/);
  assert.match(source, /auditSummary:\s*secondPanelReviewerIsolation \? null : market\.auditSummary/);
  assert.match(source, /confidence:\s*secondPanelReviewerIsolation \? null : resolution\.confidence/);
  assert.match(source, /triggers:\s*isolatedPanelView \? \[\] : panel\.triggers\.map/);
  assert.match(source, /auditTrail:\s*secondPanelReviewerIsolation \? \[\] : auditTrail\.map/);
  assert.match(source, /conflictReports:\s*secondPanelReviewerIsolation \? \[\] : conflictReports\.map/);
  assert.match(source, /reviewerCount:\s*secondPanelReviewerIsolation \? null : currentPanel\.assignments\.length/);
  assert.match(source, /agreementCount:\s*secondPanelReviewerIsolation \? null/);
});

test("reviewer rewards use pending lifecycle and cannot confirm before finalized settlement", () => {
  const source = service();

  assert.match(source, /status:\s*"PENDING_FINALIZATION"/);
  assert.match(source, /confirmPendingReviewerRewards/);
  assert.match(source, /Reviewer rewards cannot be confirmed before market finalization/);
  assert.match(source, /status:\s*"PENDING_FINALIZATION"[\s\S]*?data:\s*\{\s*status:\s*"CONFIRMED"\s*\}/);
  assert.match(source, /if \(marketIsFinal\(market\)\)[\s\S]*?confirmPendingReviewerRewards/);
  assert.match(source, /markReviewerRewardFinalizationFailure/);
});

test("settlement retry path preserves pending rewards after confirmation failure", () => {
  const source = service();

  assert.match(source, /try \{[\s\S]*?confirmPendingReviewerRewards\(db, \{ marketId: market\.id \}\)/);
  assert.match(source, /catch \(error\) \{[\s\S]*?markReviewerRewardFinalizationFailure/);
  assert.match(source, /status:\s*"PENDING_FINALIZATION"[\s\S]*?reason:\s*`Pending finalization retry required:/);
});

test("receipt hash job is queued, retryable and exposed to UI", () => {
  const source = service();
  const receiptRoute = readFileSync("app/api/internal/proof-flow/receipts/hash/run/route.ts", "utf8");
  const ui = panel();

  assert.match(source, /proofFlowReceiptHashJob\.upsert/);
  assert.match(source, /HASH_CONFIRMED/);
  assert.match(source, /HASH_FAILED/);
  assert.match(receiptRoute, /processProofFlowReceiptHashJobs/);
  assert.match(ui, /Receipt hash status/);
  assert.match(ui, /Receipt hash/);
});

test("market page switches evidence links and renders h m s countdown labels", () => {
  const ui = panel();
  const room = readFileSync("components/nexmarkets/market-room.tsx", "utf8");

  assert.match(ui, /View Proposal Evidence/);
  assert.match(ui, /href=\{String\(proposal\.evidenceUrl\)\}/);
  assert.match(ui, /View Evidence Board/);
  assert.match(ui, /Proposal bond[\s\S]*?bondStatus/);
  assert.match(ui, /Challenge bond[\s\S]*?bondStatus/);
  assert.match(ui, /hasResolutionNote \?/);
  assert.match(ui, /Challenge countdown/);
  assert.match(ui, /\$\{hours\}h \$\{minutes\}m \$\{seconds\}s/);
  assert.match(room, />YES<\/span><b>\{priceLabel\}/);
  assert.match(room, />NO<\/span><b>\{noPriceLabel\}/);
  assert.doesNotMatch(room, /v40-side-price/);
});

test("ProofFlow bot mirrors native settlement onchain before trader claims unlock", () => {
  const bot = readFileSync("lib/services/nativeResolutionBotService.ts", "utf8");
  const grantScript = readFileSync("scripts/contracts/grant-resolution-bot-roles.ts", "utf8");
  const source = service();

  assert.match(bot, /function proposeResult\(address market,uint8 winner\)/);
  assert.match(bot, /function disputeResult\(address market\)/);
  assert.match(bot, /function finalizeUndisputed\(address market\)/);
  assert.match(bot, /function finalizeDisputed\(address market,uint8 winner,bool invalid\)/);
  assert.match(bot, /function markInvalid\(address market\)/);
  assert.match(bot, /settleProofFlowMarketsOnchain/);
  assert.match(bot, /proof_flow_onchain_settlement/);
  assert.match(bot, /recordProofFlowOnchainSettlement/);
  assert.match(bot, /refreshProofFlowReceiptHash/);
  assert.match(grantScript, /DISPUTER_ROLE/);
  assert.match(source, /onchainSettlementTxHash/);
  assert.match(source, /onchainSettlementReady/);
});

test("settlement receipt uses redeem for winning markets and side refunds for invalid markets", () => {
  const ui = panel();
  const abi = readFileSync("lib/contracts/nexmarkets.ts", "utf8");

  assert.match(abi, /name:\s*"refund"[\s\S]*?type:\s*"uint8"/);
  assert.match(ui, /onchainSettlementReady/);
  assert.match(ui, /Claims unlock after the ProofFlow bot writes the final settlement/);
  assert.match(ui, /functionName:\s*"refund"[\s\S]*?args:\s*\[side \?\? 0\]/);
  assert.match(ui, /functionName:\s*"redeem"/);
  assert.match(ui, /Refund Ride/);
  assert.match(ui, /Refund Fade/);
});
