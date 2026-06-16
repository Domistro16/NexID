import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = readFileSync("lib/services/agentLaunchService.ts", "utf8");
const profileService = readFileSync("lib/services/agentProfileService.ts", "utf8");
const authService = readFileSync("lib/services/bankr/agentAuthService.ts", "utf8");
const validation = readFileSync("lib/server/validation.ts", "utf8");
const dashboard = readFileSync("components/nexid/dashboard/dashboard-page-client.tsx", "utf8");
const mintPage = readFileSync("components/nexid/mint/mint-page-client.tsx", "utf8");
const marketCard = readFileSync("components/nexmarkets/market-card.tsx", "utf8");
const agentProfilePage = readFileSync("app/agents/[id]/page.tsx", "utf8");
const launchRoute = readFileSync("app/api/v1/markets/launch/route.ts", "utf8");
const externalCredentialRoute = readFileSync("app/api/v1/agents/[id]/external-credentials/route.ts", "utf8");
const idService = readFileSync("lib/services/idService.ts", "utf8");
const nexdomainsClient = readFileSync("lib/services/nexdomainsClient.ts", "utf8");
const schema = readFileSync("prisma/schema.prisma", "utf8");
const docs = readFileSync("docs/agent-launch.md", "utf8");

test("public agent launch requires agent .id before launch", () => {
  assert.match(service, /Public agent launches require an agent \.id/);
  assert.match(service, /agent_id_required/);
  assert.match(service, /assertAgentCanPublicLaunch/);
  assert.match(launchRoute, /authenticateAgentRequest\(request, "markets:launch"\)/);
});

test("inline mint or register flow is exposed", () => {
  assert.match(service, /registerAgentId/);
  assert.match(service, /mintAgentId/);
  assert.match(service, /prepareIdMint/);
  assert.match(docs, /--mint-if-needed/);
});

test("launch bond remains 20 dollars and is included in receipts", () => {
  assert.match(service, /AGENT_LAUNCH_BOND_USDC = 20/);
  assert.match(validation, /confirmBond/);
  assert.match(service, /creatorBondAmount: AGENT_LAUNCH_BOND_USDC/);
  assert.match(service, /Agent public launch receipt/);
});

test("dashboard exposes agent controls and launch records", () => {
  assert.match(dashboard, /AgentsPanel/);
  assert.match(dashboard, /Pause/);
  assert.match(dashboard, /Revoke/);
  assert.match(dashboard, /Disable launches/);
  assert.match(dashboard, /Daily launch limit/);
  assert.match(dashboard, /Validation failures/);
  assert.match(dashboard, /Trust score/);
  assert.match(dashboard, /agent\.badges/);
});

test("launch scopes do not include trading scopes", () => {
  assert.match(authService, /markets:launch/);
  assert.match(launchRoute, /markets:launch/);
  assert.doesNotMatch(authService, /markets:trade|orders:place|portfolio:write|wallet:delegate/);
  assert.match(docs, /No trading scopes exist/);
});

test("agent profile and reputation models are standalone", () => {
  assert.match(schema, /model AgentProfile/);
  assert.match(schema, /model AgentReputationSnapshot/);
  assert.match(schema, /model AgentReputationEvent/);
  assert.match(schema, /model AgentExternalCredential/);
  assert.match(schema, /model AgentBadge/);
  assert.match(schema, /agentProfileId\s+String\?/);
  assert.match(profileService, /calculateAgentReputation/);
  assert.match(profileService, /communityTrustScore/);
  assert.match(profileService, /launchPolicyForReputation/);
  assert.doesNotMatch(profileService, /from ["'].*erc8004|from ["'].*erc8126/);
});

test("agent profile UI and APIs expose reputation, badges, and external credentials", () => {
  assert.match(agentProfilePage, /Markets launched/);
  assert.match(agentProfilePage, /Creator fees earned/);
  assert.match(agentProfilePage, /Invalid markets/);
  assert.match(agentProfilePage, /Disputed markets/);
  assert.match(agentProfilePage, /External trust/);
  assert.match(marketCard, /Launched by agent/);
  assert.match(externalCredentialRoute, /agentExternalCredentialSchema/);
  assert.match(externalCredentialRoute, /upsertOwnedAgentExternalCredential/);
  assert.match(docs, /future ERC-8004 identity references and ERC-8126 verification scores/);
});

test("relayer .id mints do not set reverse records or local primary state", () => {
  assert.match(nexdomainsClient, /reverseRecord = input\.reverseRecord \?\? true/);
  assert.match(nexdomainsClient, /reverseRecord: input\.reverseRecord/);
  assert.match(idService, /prepareIdMintWithClaimableBalance[\s\S]*buildNexDomainsRegistration\(\{ name, owner, referralCode, reverseRecord: false \}\)/);
  assert.match(idService, /prepareIdMint\(nameInput[\s\S]*buildNexDomainsRegistration\(\{ name, owner, referralCode \}\)/);
  assert.match(idService, /setPrimaryLocally: false/);
  assert.match(idService, /primaryOnchainRequired/);
  assert.match(idService, /claimableBalanceLedger\.findMany\(\{[\s\S]*entryType: "reserve"[\s\S]*status: "spent"/);
});

test("relayer .id primary confirmation notice is shown in mint and dashboard UI", () => {
  assert.match(mintPage, /primaryOnchainNotice/);
  assert.match(mintPage, /not been set as your primary name onchain/);
  assert.match(mintPage, /wallet\.setUser\(prepared\.primaryOnchainRequired \? user :/);
  assert.match(mintPage, /wallet\.setUser\(activated\.primaryOnchainRequired \? user :/);
  assert.match(dashboard, /pendingPrimaryId/);
  assert.match(dashboard, /not your onchain primary yet/);
  assert.match(dashboard, /Primary name/);
});
