import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const proverService = readFileSync("lib/services/proofFlowProverService.ts", "utf8");
const proofFlowService = readFileSync("lib/services/proofFlowService.ts", "utf8");
const schema = readFileSync("prisma/schema.prisma", "utf8");
const validation = readFileSync("lib/server/validation.ts", "utf8");
const registerRoute = readFileSync("app/api/provers/agent/register/route.ts", "utf8");
const policyRoute = readFileSync("app/api/internal/proof-flow/agent-provers/policy/route.ts", "utf8");
const docs = readFileSync("docs/proofflow-agent-provers.md", "utf8");

test("agent Prover registration has shared identity, stake, cap, and kill-switch state", () => {
  assert.match(schema, /agentProfileId\s+String\?/);
  assert.match(schema, /roleType\s+String\s+@default\("HUMAN"\)/);
  assert.match(schema, /stakeAmountUsdc\s+Float\s+@default\(0\)/);
  assert.match(schema, /model ProofFlowProverRegistrationPolicy/);
  assert.match(schema, /agentRegistrationsPaused\s+Boolean\s+@default\(false\)/);
  assert.match(schema, /weeklyAgentRegistrationCap Int\s+@default\(20\)/);
  assert.match(proverService, /registerAgentProver/);
  assert.match(proverService, /Agent Prover registrations are paused/);
  assert.match(proverService, /Weekly Agent Prover registration cap reached/);
  assert.match(proverService, /AGENT_PROVER_REGISTERED/);
  assert.match(proverService, /AGENT_PROVER_STAKE_RECORDED/);
  assert.match(registerRoute, /proofFlowAgentProverRegisterSchema/);
  assert.match(policyRoute, /proofFlowAgentProverPolicySchema/);
  assert.match(validation, /proofFlowAgentProverRegisterSchema/);
});

test("selection is pool-agnostic and can run agent-only without hardcoding agents", () => {
  assert.match(proverService, /selectProverPanelFromPool/);
  assert.match(proverService, /poolId/);
  assert.match(proverService, /roleTypes/);
  assert.match(proverService, /PROOFFLOW_ACTIVE_PROVER_ROLE_TYPES/);
  assert.match(proofFlowService, /selectionMode:\s*"deterministic_algorithmic_prover_pool"/);
  assert.match(proofFlowService, /roleTypes:\s*roleTypes \?\? "all"/);
  assert.doesNotMatch(proofFlowService, /agent-only/);
  assert.match(docs, /Leaving it empty permits a mixed pool without rewriting selection/);
});

test("fixed reveal window prevents early settlement after fast agent reveals", () => {
  assert.match(proofFlowService, /if \(now < panel\.reviewDeadline\) return null;/);
  assert.match(proofFlowService, /if \(now < panel\.revealDeadline\) return null;/);
  assert.doesNotMatch(proofFlowService, /allRevealed[\s\S]*now < panel\.revealDeadline/);
  assert.match(docs, /no longer settles early when all reveals arrive/);
});

test("agent Prover rewards are reputation-weighted and wrong verdicts are slashable", () => {
  assert.match(proverService, /reputationWeightsForAssignments/);
  assert.match(proofFlowService, /reputation_weighted_share/);
  assert.match(proofFlowService, /wrong_verdict_slash_pending/);
  assert.match(proofFlowService, /Prover verdict did not match the final resolved outcome/);
  assert.match(proverService, /applyFinalProverSlashing/);
  assert.match(proverService, /STAKE_SLASHED/);
  assert.match(proverService, /SLASH_DISTRIBUTION/);
  assert.match(docs, /Stake size is not part of reward weighting/);
});
