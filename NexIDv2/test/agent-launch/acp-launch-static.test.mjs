import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = readFileSync("lib/services/acp/nexmindAcpService.ts", "utf8");
const schema = readFileSync("prisma/schema.prisma", "utf8");
const validation = readFileSync("lib/server/validation.ts", "utf8");
const providerRoute = readFileSync("app/api/acp/provider/route.ts", "utf8");
const jobsRoute = readFileSync("app/api/acp/jobs/route.ts", "utf8");
const confirmRoute = readFileSync("app/api/acp/jobs/[id]/confirm/route.ts", "utf8");
const settlementRoute = readFileSync("app/api/acp/jobs/[id]/settlement/route.ts", "utf8");
const docs = readFileSync("docs/acp-nexmind-market-launch.md", "utf8");

test("NexMind ACP provider and job records are modeled", () => {
  assert.match(schema, /model AcpProviderOffering/);
  assert.match(schema, /model AcpMarketLaunchJob/);
  assert.match(schema, /requesterAgentProfileId\s+String\?/);
  assert.match(schema, /resolvedPublicId\s+String\?/);
  assert.match(schema, /acpFeeStatus\s+String/);
});

test("ACP routes expose provider discovery, job creation, confirmation, and fee settlement", () => {
  assert.match(providerRoute, /getAcpProviderOffering/);
  assert.match(jobsRoute, /createAcpMarketLaunchJob/);
  assert.match(confirmRoute, /confirmAcpMarketLaunchJob/);
  assert.match(settlementRoute, /recordAcpJobFeeSettlement/);
  assert.match(validation, /acpMarketLaunchJobSchema/);
  assert.match(validation, /confirmationMode: z\.enum\(\["manual", "auto"\]\)/);
});

test("ACP reuses NexMind structuring and standard requester launch path", () => {
  assert.match(service, /composeNexMindMarketDraft/);
  assert.match(service, /resolutionCardFromDraft/);
  assert.match(service, /launchMarketForAgent/);
  assert.match(service, /launchMethod: "acp_nexmind"/);
  assert.match(service, /ownerAccount: response\.transaction\.ownerAccount/);
  assert.doesNotMatch(service, /createNativeMarketRecord\(/);
});

test("requester wallet remains creator while ACP fee is separate NexMind revenue", () => {
  assert.match(service, /creatorOfRecord: "requester_wallet"/);
  assert.match(service, /creatorBondPaidBy: "requester_wallet"/);
  assert.match(service, /ACP_MARKET_LAUNCH_FEE_USDC = 2/);
  assert.match(service, /recordAcpJobFeeSettlement/);
  assert.match(service, /nexMindCreatorOfRecord: false/);
  assert.match(docs, /does not make NexMind the creator of record/);
  assert.match(docs, /ACP service-fee settlement is recorded separately/);
});

test("ACP identity handling writes through the shared agent profile and supports preferred or derived ids", () => {
  assert.match(service, /ensureAcpRequesterAgent/);
  assert.match(service, /AgentProfile\.publicId/);
  assert.match(service, /preferredDomain/);
  assert.match(service, /derivePublicId/);
  assert.match(service, /prepareIdMint/);
  assert.match(service, /idAction/);
  assert.match(docs, /same `AgentProfile` and `\.id` record/);
});
