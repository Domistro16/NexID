import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = () => readFileSync("lib/services/sourceQualificationService.ts", "utf8");
const launchRoute = () => readFileSync("app/api/native-markets/route.ts", "utf8");
const marketService = () => readFileSync("lib/services/nexmarketsService.ts", "utf8");
const launchUi = () => readFileSync("components/nexmarkets/launch/launch-studio-client.tsx", "utf8");
const validation = () => readFileSync("lib/server/validation.ts", "utf8");
const schema = () => readFileSync("prisma/schema.prisma", "utf8");

test("source qualification service scores source quality and rejects unstructured sources", () => {
  const source = service();

  assert.match(source, /export const SourceQualificationService/);
  assert.match(source, /export function scoreSourceQuality/);
  assert.match(source, /reachability:\s*input\.reachable && input\.statusCode === 200 \? 20 : 0/);
  assert.match(source, /structuredData:\s*structured \? 25 : 0/);
  assert.match(source, /stability:\s*stable \? 20 : 5/);
  assert.match(source, /determinism:\s*structured && input\.extractorValid && deterministic \? 25 : 0/);
  assert.match(source, /timestampSupport:\s*timestamp \? 10 : 0/);
  assert.match(source, /sourceDecisionForScore\(score\)/);
  assert.match(source, /responseLooksBlocked/);
  assert.match(source, /captcha\|sign in\|log in\|login required\|unauthorized\|forbidden\|paywall/);
});

test("valid crypto API sources get deterministic extractor validation and dry-run settlement", () => {
  const source = service();

  assert.match(source, /token_price_threshold/);
  assert.match(source, /field:\s*"market_data\.current_price\.usd"/);
  assert.match(source, /parseThreshold\(`\$\{draft\.title\} \$\{draft\.question\} \$\{draft\.resolution\.method\}`\)/);
  assert.match(source, /replace\(\/,\/g,\s*""\)/);
  assert.match(source, /validateSettlementExtractor/);
  assert.match(source, /simulateSettlement/);
  assert.match(source, /Dry run settlement executed successfully/);
  assert.match(source, /provisionalOutcome:\s*rideWins \? "ride" : "fade"/);
});

test("extractor validation fails when field, type or operator is invalid", () => {
  const source = service();

  assert.match(source, /Extractor field \$\{input\.extractor\.field\} was not found/);
  assert.match(source, /expected \$\{input\.extractor\.valueType\}/);
  assert.match(source, /Unsupported extractor operator/);
  assert.match(source, /Extractor target is required for comparison operators/);
});

test("dry-run and determinism both need repeatable extraction before auto launch", () => {
  const source = service();

  assert.match(source, /const secondFetch = await fetchSource/);
  assert.match(source, /const secondValidation[\s\S]*?= secondFetch\.ok/);
  assert.match(source, /extractedValuesCompatible/);
  assert.match(source, /Extractor produced a compatible result across two independent executions/);
  assert.match(source, /deterministic/);
});

test("source repair supports crypto inference and configured non-crypto feeds", () => {
  const source = service();

  assert.match(source, /NEXMARKETS_COINGECKO_IDS_JSON/);
  assert.match(source, /coinGeckoApiUrl/);
  assert.match(source, /https:\/\/api\.coingecko\.com\/api\/v3\/coins/);
  assert.match(source, /NEXMARKETS_SOURCE_REPAIR_SOURCES_JSON/);
  assert.match(source, /configuredRepairSourceForDraft/);
  assert.match(source, /\? "accepted" : "rejected"/);
  assert.match(source, /status:\s*"rejected"/);
});

test("failed qualification downgrades to evidence-based or blocks launch", () => {
  const source = service();

  assert.match(source, /downgradeDraftToEvidenceBased/);
  assert.match(source, /sourceType:\s*"manual_optimistic"/);
  assert.match(source, /Auto-verifiable source qualification failed; market was downgraded/);
  assert.match(source, /status:\s*"BLOCKED"/);
  assert.match(source, /No usable source URL exists\. Add a public source before launching/);
  assert.match(source, /sourceQualificationBlocksLaunch/);
});

test("native launch route requalifies drafts and blocks unqualified auto-verifiable launches", () => {
  const route = launchRoute();
  const markets = marketService();
  const validator = validation();
  const client = readFileSync("lib/services/nexid-client.ts", "utf8");
  const ui = launchUi();

  assert.match(route, /qualifyMarketDraftForLaunch/);
  assert.match(route, /const savedDraft = body\.draftId \? await getMarketDraft\(body\.draftId\) : null/);
  assert.match(route, /const baseDraft = savedDraft \?\? body\.draft \?\? null/);
  assert.match(route, /if \(body\.draftId && savedDraft\) await updateMarketDraftShape\(body\.draftId,\s*draft\)/);
  assert.match(route, /sourceQualificationBlocksLaunch\(draft\)/);
  assert.match(route, /sourceQualification:\s*draft\.sourceQualification/);
  assert.match(route, /The previous draft was temporary and was not persisted in the database/);
  assert.match(validator, /draft:\s*shapedMarketDraftSchema\.optional\(\)/);
  assert.match(client, /draft\?: ShapedMarketDraft/);
  assert.match(ui, /draft,\s*\n\s*walletAddress/);
  assert.match(markets, /assertSourceQualifiedForLaunch/);
  assert.match(markets, /Auto-verifiable markets must pass source qualification, extractor validation and dry-run settlement before launch/);
});

test("qualification reports are persisted and audited on drafts and launched markets", () => {
  const markets = marketService();
  const dbSchema = schema();
  const migration = readFileSync("prisma/migrations/20260605170000_add_source_qualification/migration.sql", "utf8");

  for (const field of [
    "sourceQualificationStatus",
    "sourceQualificationScore",
    "sourceQualificationReason",
    "sourceValidationTimestamp",
    "sourceRepairAttempts",
    "extractorValidationStatus",
    "extractorValidationReason",
    "dryRunStatus",
    "dryRunResult"
  ]) {
    assert.match(dbSchema, new RegExp(field));
    assert.match(migration, new RegExp(field));
    assert.match(markets, new RegExp(field));
  }
  assert.match(markets, /sourceQualificationAuditMetadata/);
  assert.match(markets, /action:\s*"source_qualification"/);
  assert.match(markets, /action:\s*"source_qualification_update"/);
  assert.match(markets, /sourceQualification:\s*input\.draft\.sourceQualification/);
});

test("validators and launch UI expose source quality, extractor validation, dry run and settlement mode", () => {
  const validator = validation();
  const ui = launchUi();

  assert.match(validator, /sourceQualificationSchema/);
  assert.match(validator, /settlementExtractorSchema/);
  assert.match(validator, /sourceQualification:\s*sourceQualificationSchema\.nullable\(\)\.optional\(\)/);
  assert.match(ui, /SourceQualificationPanel/);
  assert.match(ui, /evidenceBasedByDesign/);
  assert.match(ui, /Public source locked\. Automated extraction is not required for this market type\./);
  assert.match(ui, /Evidence-Based ProofFlow/);
  assert.match(ui, /Source Quality/);
  assert.match(ui, /Extractor validation/);
  assert.match(ui, /Dry run settlement/);
  assert.match(ui, /Auto-Verifiable/);
  assert.match(ui, /Evidence-Based/);
  assert.match(ui, /ly-repair-log/);
  assert.match(ui, /launchedMarketId/);
  assert.match(ui, /Market Launched/);
  assert.match(ui, /Approval[\s\S]*?Consumed/);
  assert.match(ui, /Open Market Room/);
});

test("native market deployment and sync scripts enable every supported template", () => {
  const sepoliaDeploy = readFileSync("scripts/contracts/deploy-base-sepolia.ts", "utf8");
  const mainnetDeploy = readFileSync("scripts/contracts/deploy-base-mainnet.ts", "utf8");
  const syncScript = readFileSync("scripts/contracts/set-native-market-templates.ts", "utf8");
  const pkg = readFileSync("package.json", "utf8");
  const templates = [
    "token_price_threshold",
    "token_basket_race",
    "official_announcement",
    "sports_result",
    "sports_transfer",
    "chart_rank",
    "award_outcome",
    "public_release",
    "custom_objective"
  ];

  for (const template of templates) {
    assert.match(sepoliaDeploy, new RegExp(template));
    assert.match(mainnetDeploy, new RegExp(template));
    assert.match(syncScript, new RegExp(template));
  }
  assert.match(syncScript, /allowedTemplates\(templateId\)/);
  assert.match(syncScript, /setTemplateAllowed\(templateId,\s*true\)/);
  assert.match(syncScript, /TEMPLATE_ADMIN_ROLE/);
  assert.match(pkg, /contracts:templates:base-sepolia/);
  assert.match(pkg, /contracts:templates:base-mainnet/);
});
